import { and, desc, eq, gte, isNotNull, like, schema, sql } from "@viewing/db";
import type { ValuationAnswers } from "@viewing/db/schema";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { recordEvent } from "../events";
import { draftValuationFollowUp } from "../planner/agent";
import { defineTool, type ToolContext } from "../tool";
import { estimate, type Comparable, type MarketMedian } from "../valuation/model";

const { valuations, contacts, leads, listings, agents, postcodes, marketPrices } = schema;

const answersSchema = z.object({
  propertyType: z.enum(["house", "apartment", "villa"]),
  livingArea: z.coerce.number().int().min(15).max(2000),
  plotArea: z.coerce.number().int().min(0).max(100000).optional(),
  bedrooms: z.coerce.number().int().min(0).max(20),
  bathrooms: z.coerce.number().int().min(0).max(10),
  yearBuilt: z.coerce.number().int().min(1700).max(2100).optional(),
  condition: z.enum(["to_renovate", "good", "renovated", "new"]),
  epcLabel: z.enum(["A+", "A", "B", "C", "D", "E", "F"]).optional(),
  kitchen: z.enum(["basic", "standard", "high_end"]).optional(),
  extras: z.array(z.enum(["garage", "garden", "terrace", "pool", "solar"])).default([]),
  plans: z.enum(["sell_soon", "sell_later", "curious"]).optional(),
}) satisfies z.ZodType<ValuationAnswers>;

/**
 * Statbel figures for the municipality behind a postcode. Quarterly data is
 * combined over the last four quarters (eight if too many quarters had their
 * price suppressed for having under 10 sales): sales are added up and the
 * quartiles averaged, weighted by the number of sales.
 */
export async function marketFor(ctx: Pick<ToolContext, "db">, postcode: string, propertyType: ValuationAnswers["propertyType"]): Promise<MarketMedian | null> {
  const [place] = await ctx.db.select({ nisCode: postcodes.nisCode }).from(postcodes).where(and(eq(postcodes.postcode, postcode), isNotNull(postcodes.nisCode))).limit(1);
  if (!place?.nisCode) return null;
  const rows = await ctx.db
    .select()
    .from(marketPrices)
    .where(and(eq(marketPrices.nisCode, place.nisCode), eq(marketPrices.propertyType, propertyType)))
    .orderBy(desc(marketPrices.year), desc(marketPrices.quarter))
    .limit(8);
  const quarterly = rows.filter((r) => r.quarter > 0);
  let used = quarterly.slice(0, 4);
  if (used.filter((r) => r.median != null).length < 2) used = quarterly.slice(0, 8);
  if (used.filter((r) => r.median != null).length === 0) {
    // Yearly files (quarter 0): the latest year with a published median.
    const yearly = rows.find((r) => r.quarter === 0 && r.median != null && r.transactions >= 10);
    return yearly
      ? { municipality: yearly.municipality, propertyType: yearly.propertyType, year: yearly.year, median: yearly.median!, transactions: yearly.transactions, p25: yearly.p25, p75: yearly.p75 }
      : null;
  }
  const priced = used.filter((r) => r.median != null);
  const weight = priced.reduce((n, r) => n + r.transactions, 0);
  const avg = (k: "median" | "p25" | "p75") => {
    const withValue = priced.filter((r) => r[k] != null);
    const w = withValue.reduce((n, r) => n + r.transactions, 0);
    return w ? Math.round(withValue.reduce((sum, r) => sum + r[k]! * r.transactions, 0) / w) : null;
  };
  const newest = used[0]!;
  const oldest = used.at(-1)!;
  return {
    municipality: newest.municipality,
    propertyType: newest.propertyType,
    year: newest.year,
    period: `Q${oldest.quarter} ${oldest.year} – Q${newest.quarter} ${newest.year}`,
    median: avg("median")!,
    p25: avg("p25"),
    p75: avg("p75"),
    // All sales in the period count, also those in quarters whose price was suppressed.
    transactions: used.reduce((n, r) => n + r.transactions, 0) || weight,
  };
}

/** The agency's own sales of the same type: same postcode first, then the surrounding area (same first two digits). */
async function comparablesFor(ctx: ToolContext, postcode: string, propertyType: ValuationAnswers["propertyType"]): Promise<Comparable[]> {
  const rows = await ctx.db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.agencyId, ctx.agencyId),
        eq(listings.status, "sold"),
        eq(listings.propertyType, propertyType),
        isNotNull(listings.soldAt),
        like(listings.postcode, `${postcode.slice(0, 2)}%`),
      ),
    )
    .orderBy(desc(listings.soldAt))
    .limit(30);
  return rows
    .sort((a, b) => Number(b.postcode === postcode) - Number(a.postcode === postcode))
    .map((l) => ({
      street: l.street ?? "",
      city: l.city ?? "",
      propertyType: l.propertyType,
      livingArea: l.livingArea,
      price: l.soldPrice ?? l.price ?? 0,
      soldAt: l.soldAt!,
      condition: (l.features.condition as Comparable["condition"]) ?? undefined,
      epcLabel: l.epcLabel,
    }))
    .filter((c) => c.price > 0);
}

/** The agent working closest to the address: most listings in that postcode area, else the first active agent. */
async function agentFor(ctx: ToolContext, postcode: string) {
  const [local] = await ctx.db
    .select({ id: agents.id, n: sql<number>`count(${listings.id})::int` })
    .from(agents)
    .leftJoin(listings, and(eq(listings.agentId, agents.id), like(listings.postcode, `${postcode.slice(0, 2)}%`)))
    .where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.active, true)))
    .groupBy(agents.id)
    .orderBy(desc(sql`count(${listings.id})`))
    .limit(1);
  return local?.id ?? null;
}

const normalisePhone = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.startsWith("0") ? `+32${digits.slice(1)}` : digits.startsWith("+") ? digits : `+${digits}`;
};

/** WhatsApp verification goes live once the business number is connected; until then the code is shown on screen (demo). */
export function verificationMethod(): "whatsapp" | "demo" {
  return process.env.WHATSAPP_VERIFY_NUMBER ? "whatsapp" : "demo";
}

export const requestValuation = defineTool({
  name: "valuations_request",
  description: "Start a home valuation from the website widget. Returns a token and how the owner verifies their phone; the estimate is shown only after verification.",
  mutates: true,
  input: z.object({
    street: z.string().trim().min(2).max(120),
    houseNumber: z.string().trim().max(20).optional(),
    postcode: z.string().trim().regex(/^\d{4}$/),
    city: z.string().trim().min(2).max(80),
    answers: answersSchema,
    firstName: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().min(8).max(20),
    language: z.enum(["nl", "fr", "en"]).default("nl"),
    consent: z.literal(true),
  }),
  run: async (ctx, input) => {
    const method = verificationMethod();
    const [valuation] = await ctx.db
      .insert(valuations)
      .values({
        agencyId: ctx.agencyId,
        street: input.street,
        houseNumber: input.houseNumber,
        postcode: input.postcode,
        city: input.city,
        answers: input.answers,
        firstName: input.firstName,
        email: input.email,
        phone: normalisePhone(input.phone),
        language: input.language,
        verificationCode: String(randomInt(100000, 1000000)),
        verificationMethod: method,
        agentId: await agentFor(ctx, input.postcode),
      })
      .returning();
    await recordEvent(ctx, { type: "valuation.requested", subjectType: "valuation", subjectId: valuation!.id, data: { postcode: input.postcode } });
    const whatsappNumber = process.env.WHATSAPP_VERIFY_NUMBER?.replace(/\D/g, "");
    return {
      token: valuation!.token,
      method,
      // WhatsApp: the owner sends this prefilled message from their own phone, which proves the number.
      whatsappLink: whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Code ${valuation!.verificationCode}`)}` : null,
      demoCode: method === "demo" ? valuation!.verificationCode : null,
    };
  },
});

/** Marks the phone verified, computes the estimate, creates the seller lead and the planner's draft. */
async function completeValuation(ctx: ToolContext, valuation: typeof valuations.$inferSelect, useAi = true) {
  const [market, comparables] = await Promise.all([
    marketFor(ctx, valuation.postcode, valuation.answers.propertyType),
    comparablesFor(ctx, valuation.postcode, valuation.answers.propertyType),
  ]);
  const result = estimate({ answers: valuation.answers, market, comparables });

  let [contact] = await ctx.db.select().from(contacts).where(and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.phone, valuation.phone)));
  contact ??= (
    await ctx.db
      .insert(contacts)
      .values({ agencyId: ctx.agencyId, firstName: valuation.firstName, email: valuation.email, phone: valuation.phone, language: valuation.language, whatsappOptIn: true })
      .returning()
  )[0]!;
  const temperature = valuation.answers.plans === "sell_soon" ? "hot" : valuation.answers.plans === "sell_later" ? "warm" : "cold";
  const [lead] = await ctx.db
    .insert(leads)
    .values({
      agencyId: ctx.agencyId,
      contactId: contact.id,
      agentId: valuation.agentId,
      source: "valuation",
      intent: "sell",
      stage: "new",
      message: `Valuation requested for ${valuation.street} ${valuation.houseNumber ?? ""}, ${valuation.postcode} ${valuation.city}`.replace(/\s+,/, ","),
      qualification: {
        answers: [{ id: "plans", question: "Plans to sell", answer: { sell_soon: "Within 6 months", sell_later: "Later", curious: "Just curious" }[valuation.answers.plans ?? "curious"] }],
        temperature,
      },
    })
    .returning();
  await ctx.db
    .update(valuations)
    .set({ verifiedAt: new Date(), result, contactId: contact.id, leadId: lead!.id })
    .where(eq(valuations.id, valuation.id));
  await recordEvent(ctx, {
    type: "valuation.completed",
    subjectType: "valuation",
    subjectId: valuation.id,
    data: { method: result?.method ?? "none", low: result?.low ?? null, high: result?.high ?? null },
  });
  await draftValuationFollowUp({ ...ctx, actor: { type: "agent", id: "planner" } }, valuation.id, { useAi });
  return result;
}

export const verifyValuation = defineTool({
  name: "valuations_verify",
  description: "Confirm the owner's phone with the code, then compute the estimate and hand the seller lead to the planner.",
  mutates: true,
  input: z.object({ token: z.string(), code: z.string().trim(), useAi: z.boolean().default(true) }),
  run: async (ctx, input) => {
    const [valuation] = await ctx.db.select().from(valuations).where(and(eq(valuations.agencyId, ctx.agencyId), eq(valuations.token, input.token)));
    if (!valuation) throw new Error("Valuation not found");
    if (valuation.verifiedAt) return { verified: true, result: valuation.result };
    if (valuation.verificationCode !== input.code.replace(/\D/g, "")) return { verified: false, result: null };
    return { verified: true, result: await completeValuation(ctx, valuation, input.useAi) };
  },
});

/** WhatsApp verification: an incoming "Code 123456" from the same number completes a pending valuation. */
export async function verifyFromWhatsApp(ctx: ToolContext, phone: string, body: string) {
  const code = body.match(/\b(\d{6})\b/)?.[1];
  if (!code) return null;
  const [valuation] = await ctx.db
    .select()
    .from(valuations)
    .where(and(eq(valuations.agencyId, ctx.agencyId), eq(valuations.phone, normalisePhone(phone)), eq(valuations.verificationCode, code)));
  if (!valuation || valuation.verifiedAt) return null;
  return completeValuation(ctx, valuation);
}

export const getValuation = defineTool({
  name: "valuations_get",
  description: "A valuation with its estimate, comparables and the agent who would do the visit.",
  mutates: false,
  input: z.object({ token: z.string() }),
  run: async (ctx, input) => {
    return (
      (await ctx.db.query.valuations.findFirst({
        where: and(eq(valuations.agencyId, ctx.agencyId), eq(valuations.token, input.token)),
        with: { agent: true },
      })) ?? null
    );
  },
});

export const listValuations = defineTool({
  name: "valuations_list",
  description: "Recent home valuations requested through the website, verified or not.",
  mutates: false,
  input: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
  run: async (ctx, input) =>
    ctx.db.select().from(valuations).where(eq(valuations.agencyId, ctx.agencyId)).orderBy(desc(valuations.createdAt)).limit(input.limit),
});

