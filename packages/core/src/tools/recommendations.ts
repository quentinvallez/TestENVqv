import { and, eq, inArray, isNotNull, schema } from "@viewing/db";
import { z } from "zod";
import { recordEvent } from "../events";
import { draftRecommendation } from "../planner/agent";
import { MIN_SCORE, similarity, type Match } from "../planner/similarity";
import { defineTool, type ToolContext } from "../tool";

const { listings, leads, appointments, contacts } = schema;

type Listing = typeof listings.$inferSelect;

const label = (l: Listing) =>
  `${[[l.street, l.houseNumber].filter(Boolean).join(" "), l.city].filter(Boolean).join(", ")} (${new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(l.price ?? 0)}${l.transaction === "rent" ? "/mo" : ""})`;

const activeListings = (ctx: ToolContext) =>
  ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.status, "active")));

/** Listings a contact has shown interest in: leads and viewings. */
async function seenBy(ctx: ToolContext, contactId: string) {
  const viaLeads = await ctx.db
    .select({ listingId: leads.listingId })
    .from(leads)
    .where(and(eq(leads.agencyId, ctx.agencyId), eq(leads.contactId, contactId), isNotNull(leads.listingId)));
  const viaViewings = await ctx.db
    .select({ listingId: appointments.listingId })
    .from(appointments)
    .where(and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.contactId, contactId), isNotNull(appointments.listingId)));
  const ids = [...new Set([...viaLeads, ...viaViewings].map((r) => r.listingId!))];
  return ids.length ? ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), inArray(listings.id, ids))) : [];
}

/** Best match of each candidate against anything the contact saw. */
function rank(seen: Listing[], candidates: Listing[], limit: number) {
  const seenIds = new Set(seen.map((s) => s.id));
  return candidates
    .filter((c) => !seenIds.has(c.id))
    .map((c) => {
      let best: (Match & { basedOn: Listing }) | null = null;
      for (const s of seen) {
        const m = similarity(s, c);
        if (m && (!best || m.score > best.score)) best = { ...m, basedOn: s };
      }
      return best && { listing: c, ...best };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export const similarListings = defineTool({
  name: "listings_similar",
  description: "Active listings similar to one listing (same kind, price range, size, area). Used for 'you may also like' on the website.",
  mutates: false,
  input: z.object({ listingId: z.string(), limit: z.number().int().min(1).max(10).default(3) }),
  run: async (ctx, input) => {
    const [listing] = await ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, input.listingId)));
    if (!listing) return [];
    return rank([listing], await activeListings(ctx), input.limit).map((r) => ({ ...r.listing, score: r.score, reasons: r.reasons }));
  },
});

export const recommendForContact = defineTool({
  name: "recommendations_for_contact",
  description: "Active listings a known client may like, based on the listings they enquired about or viewed, with the reasons.",
  mutates: false,
  input: z.object({ contactId: z.string(), limit: z.number().int().min(1).max(10).default(3) }),
  run: async (ctx, input) => {
    const seen = await seenBy(ctx, input.contactId);
    return rank(seen, await activeListings(ctx), input.limit).map((r) => ({
      listing: r.listing,
      score: r.score,
      reasons: r.reasons,
      basedOn: { id: r.basedOn.id, street: r.basedOn.street, houseNumber: r.basedOn.houseNumber, city: r.basedOn.city },
    }));
  },
});

export const suggestListings = defineTool({
  name: "planner_suggest_listings",
  description: "Draft a message to a known client suggesting listings that match their earlier interest. The draft waits in the inbox for approval.",
  mutates: true,
  input: z.object({ contactId: z.string(), useAi: z.boolean().default(true) }),
  run: async (ctx, input) => {
    const recs = await recommendForContact.run(ctx, { contactId: input.contactId, limit: 3 });
    if (recs.length === 0) return { conversationId: null, suggested: 0 };
    const planner = { ...ctx, actor: { type: "agent" as const, id: "planner" } };
    const draft = await draftRecommendation(
      planner,
      input.contactId,
      recs.map((r) => ({ id: r.listing.id, label: label(r.listing), reasons: r.reasons })),
      recs[0]!.basedOn,
      { useAi: input.useAi },
    );
    await recordEvent(planner, { type: "planner.recommended", subjectType: "contact", subjectId: input.contactId, data: { listings: recs.map((r) => r.listing.id) } });
    return { conversationId: draft?.conversationId ?? null, suggested: recs.length };
  },
});

export const findMatchingClients = defineTool({
  name: "listings_find_matches",
  description: "Known clients who showed interest in similar properties and have not seen this listing yet.",
  mutates: false,
  input: z.object({ listingId: z.string(), limit: z.number().int().min(1).max(50).default(20) }),
  run: async (ctx, input) => {
    const [listing] = await ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, input.listingId)));
    if (!listing) return [];
    const interest = await ctx.db
      .select({ contactId: leads.contactId, listingId: leads.listingId })
      .from(leads)
      .where(and(eq(leads.agencyId, ctx.agencyId), isNotNull(leads.listingId)));
    const others = await ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), inArray(listings.id, [...new Set(interest.map((i) => i.listingId!))])));
    const byId = new Map(others.map((l) => [l.id, l]));
    const alreadyInterested = new Set(interest.filter((i) => i.listingId === listing.id).map((i) => i.contactId));

    const best = new Map<string, { score: number; reasons: Match["reasons"]; basedOn: Listing }>();
    for (const i of interest) {
      if (alreadyInterested.has(i.contactId)) continue;
      const seen = byId.get(i.listingId!);
      const m = seen && similarity(seen, listing);
      if (m && m.score >= MIN_SCORE && (best.get(i.contactId)?.score ?? -1) < m.score) best.set(i.contactId, { ...m, basedOn: seen });
    }
    if (best.size === 0) return [];
    const people = await ctx.db.select().from(contacts).where(and(eq(contacts.agencyId, ctx.agencyId), inArray(contacts.id, [...best.keys()])));
    return people
      .map((p) => ({ contact: p, ...best.get(p.id)! }))
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit);
  },
});

export const suggestListingToMatches = defineTool({
  name: "planner_suggest_to_matches",
  description: "Draft a personal suggestion of this listing to each matching client. Every draft waits in the inbox for approval.",
  mutates: true,
  input: z.object({ listingId: z.string(), max: z.number().int().min(1).max(20).default(10), useAi: z.boolean().default(true) }),
  run: async (ctx, input) => {
    const [listing] = await ctx.db.select().from(listings).where(and(eq(listings.agencyId, ctx.agencyId), eq(listings.id, input.listingId)));
    if (!listing) throw new Error("Listing not found");
    const matches = await findMatchingClients.run(ctx, { listingId: input.listingId, limit: input.max });
    const planner = { ...ctx, actor: { type: "agent" as const, id: "planner" } };
    for (const m of matches) {
      await draftRecommendation(planner, m.contact.id, [{ id: listing.id, label: label(listing), reasons: m.reasons }], m.basedOn, { useAi: input.useAi });
    }
    await recordEvent(planner, { type: "planner.recommended", subjectType: "listing", subjectId: listing.id, data: { contacts: matches.length } });
    return { drafted: matches.length };
  },
});
