import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, schema, sql } from "@viewing/db";
import { z } from "zod";
import { emailAgent } from "../channels";
import { recordEvent } from "../events";
import { absoluteUrl } from "../planner/agent";
import { type Lang, toLang } from "../planner/language";
import { defineTool, type ToolContext } from "../tool";

/*
 * Agencies ask for a workspace on /signup; the platform's own agency (PLATFORM_AGENCY_ID)
 * approves each request on /signups. Approval emails a link, valid 7 days, to /join/<secret>:
 * the requester sets a password there and the workspace is created. Logins can only be
 * created with such a link or an agent invitation (see mayCreateLogin in public.ts).
 */

const { signupRequests } = schema;

const DAY = 86_400_000;
/** An approval link works this long. */
export const SIGNUP_LINK_DAYS = 7;
/** Requests taken from the public form per hour, for the whole platform. */
const PUBLIC_PER_HOUR = 20;

export const hashSignupToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The workspace that owns signup requests and previews: our own agency in the platform. */
export function platformAgencyId(): string | null {
  return process.env.PLATFORM_AGENCY_ID || process.env.PREVIEW_AGENCY_ID || null;
}

export class SignupError extends Error {}

const website = (value: string | undefined) => {
  const v = value?.trim();
  if (!v) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return url.hostname.includes(".") ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
};

/** Emails of the platform agency's owners and admins, who decide on requests. */
async function deciders(ctx: ToolContext) {
  const rows = await ctx.db
    .select({ email: schema.user.email })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(and(eq(schema.member.organizationId, ctx.agencyId), inArray(schema.member.role, ["owner", "admin"])));
  return [...new Set(rows.map((r) => r.email.toLowerCase()))];
}

export const requestSignup = defineTool({
  name: "signups_request",
  description: "An agency asks for an Unbird workspace from the public form. Stored as pending and emailed to the platform's admins to approve or decline.",
  mutates: true,
  input: z.object({
    agencyName: z.string().trim().min(2).max(120),
    website: z.string().trim().max(300).optional(),
    name: z.string().trim().min(2).max(120),
    email: z.email().max(200),
    phone: z.string().trim().max(40).optional(),
    note: z.string().trim().max(1000).optional(),
    language: z.string().optional(),
  }),
  run: async (ctx, input) => {
    const email = input.email.trim().toLowerCase();
    const site = website(input.website);
    if (input.website?.trim() && !site) throw new SignupError("That doesn't look like a website address.");
    // Asking twice gets the request already waiting, without another email to us.
    const [open] = await ctx.db
      .select({ id: signupRequests.id, status: signupRequests.status })
      .from(signupRequests)
      .where(and(eq(signupRequests.agencyId, ctx.agencyId), sql`lower(${signupRequests.email}) = ${email}`, inArray(signupRequests.status, ["pending", "approved"])))
      .limit(1);
    if (open) return { id: open.id, status: open.status, repeated: true };
    const [{ count }] = (await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(signupRequests)
      .where(and(eq(signupRequests.agencyId, ctx.agencyId), gt(signupRequests.createdAt, new Date(Date.now() - 3600_000))))) as [{ count: number }];
    if (count >= PUBLIC_PER_HOUR) throw new SignupError("Many requests came in just now. Please try again in an hour.");

    const [row] = await ctx.db
      .insert(signupRequests)
      .values({
        agencyId: ctx.agencyId,
        agencyName: input.agencyName,
        website: site,
        name: input.name,
        email,
        phone: input.phone || null,
        note: input.note || null,
        language: toLang(input.language),
      })
      .returning();
    await recordEvent(ctx, { type: "signup.requested", subjectType: "signup_request", subjectId: row!.id, data: { agencyName: row!.agencyName } });

    const text = [
      `${row!.name} asks for an Unbird workspace for ${row!.agencyName}.`,
      "",
      `Website: ${row!.website ?? "not given"}`,
      `Email: ${row!.email}`,
      `Phone: ${row!.phone ?? "not given"}`,
      ...(row!.note ? [`Note: ${row!.note}`] : []),
      "",
      `Approve or decline: ${absoluteUrl("/signups")}`,
    ].join("\n");
    for (const to of await deciders(ctx)) {
      await emailAgent(ctx, { agentId: null, to, subject: `Workspace request: ${row!.agencyName}`, text });
    }
    return { id: row!.id, status: row!.status, repeated: false };
  },
});

export const listSignups = defineTool({
  name: "signups_list",
  description: "Workspace requests from agencies, newest first: waiting, approved (link sent), declined and completed (workspace created).",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const rows = await ctx.db
      .select({
        id: signupRequests.id,
        agencyName: signupRequests.agencyName,
        website: signupRequests.website,
        name: signupRequests.name,
        email: signupRequests.email,
        phone: signupRequests.phone,
        note: signupRequests.note,
        language: signupRequests.language,
        status: signupRequests.status,
        tokenExpiresAt: signupRequests.tokenExpiresAt,
        decidedAt: signupRequests.decidedAt,
        completedAt: signupRequests.completedAt,
        createdAgencyId: signupRequests.createdAgencyId,
        createdAt: signupRequests.createdAt,
      })
      .from(signupRequests)
      .where(eq(signupRequests.agencyId, ctx.agencyId))
      .orderBy(desc(signupRequests.createdAt))
      .limit(200);
    const now = Date.now();
    return rows.map((r) => ({ ...r, linkExpired: r.status === "approved" && (r.tokenExpiresAt?.getTime() ?? 0) < now }));
  },
});

const approvalSubjects: Record<Lang, string> = {
  nl: "Je Unbird-werkruimte staat klaar",
  fr: "Votre espace Unbird est prêt",
  en: "Your Unbird workspace is ready",
  de: "Ihr Unbird-Arbeitsbereich ist bereit",
};

const approvalBodies: Record<Lang, (p: { name: string; agency: string; link: string; days: number }) => string> = {
  nl: (p) =>
    `Dag ${p.name},\n\nWelkom bij Unbird. De werkruimte voor ${p.agency} staat klaar. Kies je wachtwoord via deze link (${p.days} dagen geldig):\n\n${p.link}\n\nDaarna lezen we je panden van je website en zet je de planner met één regel op je site. De proefperiode van 30 dagen start wanneer je de werkruimte aanmaakt.\n\nTot snel,\nHet Unbird-team`,
  fr: (p) =>
    `Bonjour ${p.name},\n\nBienvenue chez Unbird. L'espace de ${p.agency} est prêt. Choisissez votre mot de passe via ce lien (valable ${p.days} jours) :\n\n${p.link}\n\nEnsuite, nous lisons vos biens sur votre site et vous ajoutez le planning à votre site avec une seule ligne. L'essai de 30 jours commence quand vous créez l'espace.\n\nÀ bientôt,\nL'équipe Unbird`,
  en: (p) =>
    `Hello ${p.name},\n\nWelcome to Unbird. The workspace for ${p.agency} is ready. Choose your password with this link (valid for ${p.days} days):\n\n${p.link}\n\nAfter that we read your listings from your website, and you put the planner on your site with one line. The 30-day trial starts when you create the workspace.\n\nSee you soon,\nThe Unbird team`,
  de: (p) =>
    `Hallo ${p.name},\n\nwillkommen bei Unbird. Der Arbeitsbereich für ${p.agency} ist bereit. Wählen Sie Ihr Passwort über diesen Link (${p.days} Tage gültig):\n\n${p.link}\n\nDanach lesen wir Ihre Objekte von Ihrer Website, und Sie bringen den Planer mit einer Zeile auf Ihre Seite. Die 30-tägige Testphase beginnt, wenn Sie den Arbeitsbereich erstellen.\n\nBis bald,\nIhr Unbird-Team`,
};

export const approveSignup = defineTool({
  name: "signups_approve",
  description: "Approve a workspace request: emails the requester a link, valid 7 days, to set a password and create the workspace. Approving again sends a new link.",
  mutates: true,
  input: z.object({ requestId: z.string() }),
  run: async (ctx, input) => {
    const token = randomBytes(24).toString("base64url");
    const [row] = await ctx.db
      .update(signupRequests)
      .set({
        status: "approved",
        tokenHash: hashSignupToken(token),
        tokenExpiresAt: new Date(Date.now() + SIGNUP_LINK_DAYS * DAY),
        decidedAt: new Date(),
        decidedBy: ctx.actor.id,
      })
      .where(and(eq(signupRequests.agencyId, ctx.agencyId), eq(signupRequests.id, input.requestId), inArray(signupRequests.status, ["pending", "approved", "declined"])))
      .returning();
    if (!row) throw new SignupError("This request can't be approved any more.");
    const link = absoluteUrl(`/join/${token}`);
    const lang = toLang(row.language);
    const sent = await emailAgent(ctx, {
      agentId: null,
      to: row.email,
      subject: approvalSubjects[lang],
      text: approvalBodies[lang]({ name: row.name.split(" ")[0] ?? row.name, agency: row.agencyName, link, days: SIGNUP_LINK_DAYS }),
    });
    await recordEvent(ctx, { type: "signup.approved", subjectType: "signup_request", subjectId: row.id, data: { delivery: sent.delivery } });
    return { link, delivery: sent.delivery, error: sent.error ?? null };
  },
});

export const declineSignup = defineTool({
  name: "signups_decline",
  description: "Decline a workspace request. Nothing is sent to the requester; an approval link already sent stops working.",
  mutates: true,
  input: z.object({ requestId: z.string() }),
  run: async (ctx, input) => {
    const [row] = await ctx.db
      .update(signupRequests)
      .set({ status: "declined", tokenHash: null, tokenExpiresAt: null, decidedAt: new Date(), decidedBy: ctx.actor.id })
      .where(and(eq(signupRequests.agencyId, ctx.agencyId), eq(signupRequests.id, input.requestId), inArray(signupRequests.status, ["pending", "approved"])))
      .returning({ id: signupRequests.id });
    if (!row) throw new SignupError("This request can't be declined any more.");
    await recordEvent(ctx, { type: "signup.declined", subjectType: "signup_request", subjectId: row.id, data: {} });
    return { id: row.id };
  },
});

/**
 * The requester opened the approval link and has a login with the request's email: take the
 * request so the link can't create a second workspace. Undone with signups_release if creating
 * the workspace fails.
 */
export const claimSignup = defineTool({
  name: "signups_claim",
  description: "Take an approved request for the login that opened its link, so the workspace is created once. Records the data processing agreement accepted, if any.",
  mutates: true,
  input: z.object({ token: z.string().min(10), email: z.string(), dpaVersion: z.string().max(40).nullable() }),
  run: async (ctx, input) => {
    const [row] = await ctx.db
      .update(signupRequests)
      .set({
        status: "completed",
        completedAt: new Date(),
        dpaVersion: input.dpaVersion,
        dpaAcceptedAt: input.dpaVersion ? new Date() : null,
      })
      .where(
        and(
          eq(signupRequests.agencyId, ctx.agencyId),
          eq(signupRequests.tokenHash, hashSignupToken(input.token)),
          eq(signupRequests.status, "approved"),
          gt(signupRequests.tokenExpiresAt, new Date()),
          sql`lower(${signupRequests.email}) = ${input.email.toLowerCase()}`,
        ),
      )
      .returning({ id: signupRequests.id, agencyName: signupRequests.agencyName, website: signupRequests.website });
    if (!row) throw new SignupError("This link doesn't work any more. Ask us for a new one.");
    return row;
  },
});

export const releaseSignup = defineTool({
  name: "signups_release",
  description: "Give a claimed request back (the workspace could not be created), so its link works again.",
  mutates: true,
  input: z.object({ requestId: z.string() }),
  run: async (ctx, input) => {
    await ctx.db
      .update(signupRequests)
      .set({ status: "approved", completedAt: null, dpaVersion: null, dpaAcceptedAt: null })
      .where(and(eq(signupRequests.agencyId, ctx.agencyId), eq(signupRequests.id, input.requestId), eq(signupRequests.status, "completed")));
    return { id: input.requestId };
  },
});

export const finishSignup = defineTool({
  name: "signups_finish",
  description: "Note the workspace created from a request.",
  mutates: true,
  input: z.object({ requestId: z.string(), createdAgencyId: z.string() }),
  run: async (ctx, input) => {
    await ctx.db
      .update(signupRequests)
      .set({ createdAgencyId: input.createdAgencyId })
      .where(and(eq(signupRequests.agencyId, ctx.agencyId), eq(signupRequests.id, input.requestId)));
    await recordEvent(ctx, { type: "signup.completed", subjectType: "signup_request", subjectId: input.requestId, data: { createdAgencyId: input.createdAgencyId } });
    return { id: input.requestId };
  },
});

/** Declined requests and links nobody used are kept this long, then deleted (people's details we no longer need). */
export const SIGNUP_RETENTION_DAYS = 180;

export async function applySignupRetention(ctx: ToolContext, now = new Date()) {
  const before = new Date(now.getTime() - SIGNUP_RETENTION_DAYS * DAY);
  const gone = await ctx.db
    .delete(signupRequests)
    .where(and(eq(signupRequests.agencyId, ctx.agencyId), inArray(signupRequests.status, ["declined", "approved", "pending"]), lt(signupRequests.updatedAt, before)))
    .returning({ id: signupRequests.id });
  return gone.length;
}
