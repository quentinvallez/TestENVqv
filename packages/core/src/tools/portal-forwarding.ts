import { and, desc, eq, inArray, schema, sql } from "@viewing/db";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { inboundAddress } from "../channels";
import { mailDomain, mailgunConfigured, newMessageId, sendWithMailgun } from "../channels/email";
import { recordEvent } from "../events";
import { authorizedFetch, oauthConfigured } from "../integrations/oauth";
import { defineTool, type ToolContext } from "../tool";

/*
 * Getting Immoweb, Zimmo and Immovlan lead emails from the agency's mailbox to
 * its inbox address. For agents who connected Outlook we create the inbox rule
 * ourselves through Microsoft Graph (MailboxSettings.ReadWrite: rules only, no
 * access to messages). Gmail users add a filter themselves; the confirmation
 * code Gmail sends to the inbox address is shown in Settings.
 */

const { agencySettings, agents, calendarConnections, leads } = schema;

export const portalDomains = ["immoweb.be", "zimmo.be", "immovlan.be"] as const;
export const PORTAL_RULE_NAME = "Portal leads → planner";

/*
 * Microsoft 365 blocks automatic forwarding outside the company unless an admin
 * allows it, and then the rule exists but nothing arrives. So after creating
 * the rule we mail the agent a test from our own check address (which the rule
 * also forwards). If it comes back to the inbox address, forwarding works; if
 * it hasn't after CHECK_WAIT_MS, it is blocked.
 */
export const CHECK_WAIT_MS = 15 * 60 * 1000;
export const checkSender = () => {
  const domain = mailDomain();
  return domain ? `forwarding-check@${domain}` : null;
};
const checkSubject = (token: string) => `Forwarding check ${token}`;
/** The token of our test email, in a forward of it (any client's "FW:"/"TR:" prefix). */
export const forwardingCheckToken = (email: { subject: string; text: string }) =>
  `${email.subject}\n${email.text}`.match(/Forwarding check ([0-9a-f]{12})\b/)?.[1] ?? null;

type ForwardingCheck = { token: string; sentAt: string; receivedAt?: string; error?: string };
type PortalRule = { ruleId: string; forwardTo: string; createdAt: string; check?: ForwardingCheck };
const ruleOf = (syncState: Record<string, unknown>) => (syncState.portalRule as PortalRule | undefined) ?? null;

export type ForwardingState = "working" | "checking" | "blocked" | "untested";
/** Pure, for tests: what the last check says about the rule. */
export function forwardingState(rule: PortalRule | null, now = new Date()): ForwardingState | null {
  if (!rule) return null;
  const check = rule.check;
  if (!check || check.error) return "untested";
  if (check.receivedAt) return "working";
  return now.getTime() - new Date(check.sentAt).getTime() < CHECK_WAIT_MS ? "checking" : "blocked";
}

export const portalLeadsStatus = defineTool({
  name: "portal_leads_status",
  description:
    "How portal leads reach the agency: its inbox address, the last lead per portal (Immoweb, Zimmo, Immovlan), which agents' Outlook forwards them automatically, and a pending Gmail forwarding confirmation code.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const address = await inboundAddress(ctx);
    const perPortal = await ctx.db
      .select({ portal: leads.source, count: sql<number>`count(*)::int`, lastAt: sql<Date>`max(${leads.createdAt})` })
      .from(leads)
      .where(and(eq(leads.agencyId, ctx.agencyId), inArray(leads.source, ["immoweb", "zimmo", "immovlan"])))
      .groupBy(leads.source);
    const [settings] = await ctx.db.select({ channels: agencySettings.channels }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
    const connections = await ctx.db
      .select({
        agentId: agents.id,
        agentName: agents.name,
        provider: calendarConnections.provider,
        accountEmail: calendarConnections.accountEmail,
        scopes: calendarConnections.scopes,
        status: calendarConnections.status,
        syncState: calendarConnections.syncState,
      })
      .from(calendarConnections)
      .innerJoin(agents, eq(agents.id, calendarConnections.agentId))
      .where(eq(calendarConnections.agencyId, ctx.agencyId))
      .orderBy(agents.name);
    return {
      inboundAddress: address,
      portals: (["immoweb", "zimmo", "immovlan"] as const).map((portal) => {
        const row = perPortal.find((p) => p.portal === portal);
        return { portal, count: row?.count ?? 0, lastAt: row?.lastAt ? new Date(row.lastAt) : null };
      }),
      gmailForwarding: settings?.channels.gmailForwarding ?? null,
      leadCopyAddress: settings?.channels.leadCopyAddress ?? null,
      mailboxes: connections.map((c) => ({
        agentId: c.agentId,
        agentName: c.agentName,
        provider: c.provider,
        accountEmail: c.accountEmail,
        active: c.status === "active",
        canForward: c.provider === "microsoft" && c.status === "active" && c.scopes.includes("rules"),
        forwarding: ruleOf(c.syncState),
        forwardingState: forwardingState(ruleOf(c.syncState)),
      })),
      outlookAvailable: oauthConfigured("microsoft"),
    };
  },
});

async function outlookConnection(ctx: ToolContext, agentId: string) {
  const [connection] = await ctx.db
    .select()
    .from(calendarConnections)
    .where(and(eq(calendarConnections.agencyId, ctx.agencyId), eq(calendarConnections.agentId, agentId), eq(calendarConnections.provider, "microsoft")))
    .orderBy(desc(calendarConnections.createdAt))
    .limit(1);
  if (!connection || connection.status !== "active") throw new Error("Connect Outlook for this agent first");
  if (!connection.scopes.includes("rules")) throw new Error("Connect Outlook again to allow the forwarding rule");
  return connection;
}

const graphRules = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules";

export const setupPortalForwarding = defineTool({
  name: "portal_forwarding_setup",
  description:
    "Create (or repair) the rule in an agent's Outlook that forwards every email from immoweb.be, zimmo.be and immovlan.be to the agency's inbox address, so portal leads arrive on their own.",
  mutates: true,
  input: z.object({ agentId: z.string() }),
  run: async (ctx, input) => {
    const forwardTo = await inboundAddress(ctx);
    if (!forwardTo) throw new Error("The inbox address isn't active yet: the platform's mail domain is not configured");
    const connection = await outlookConnection(ctx, input.agentId);
    const rule = {
      displayName: PORTAL_RULE_NAME,
      sequence: 1,
      isEnabled: true,
      // Our check address too, so the test email after setup shows whether forwarding really works.
      conditions: { senderContains: [...portalDomains, ...(checkSender() ? [checkSender()!] : [])] },
      // Forward (not redirect): the agent keeps the lead in their own inbox too.
      actions: { forwardTo: [{ emailAddress: { address: forwardTo } }], stopProcessingRules: false },
    };
    const existing = (await (await authorizedFetch(ctx, connection, graphRules)).json()) as { value: { id: string; displayName: string }[] };
    const mine = existing.value.find((r) => r.id === ruleOf(connection.syncState)?.ruleId) ?? existing.value.find((r) => r.displayName === PORTAL_RULE_NAME);
    const saved = (await (
      await authorizedFetch(ctx, connection, mine ? `${graphRules}/${mine.id}` : graphRules, { method: mine ? "PATCH" : "POST", body: JSON.stringify(rule) })
    ).json()) as { id: string };
    const portalRule: PortalRule = {
      ruleId: saved.id ?? mine!.id,
      forwardTo,
      createdAt: ruleOf(connection.syncState)?.createdAt ?? new Date().toISOString(),
      check: await sendForwardingCheck(connection.accountEmail),
    };
    await ctx.db
      .update(calendarConnections)
      .set({ syncState: { ...connection.syncState, portalRule } })
      .where(eq(calendarConnections.id, connection.id));
    await recordEvent(ctx, {
      type: mine ? "portal_forwarding.updated" : "portal_forwarding.created",
      subjectType: "agent",
      subjectId: input.agentId,
      data: { accountEmail: connection.accountEmail, forwardTo },
    });
    return { ruleId: portalRule.ruleId, accountEmail: connection.accountEmail, forwardTo, updated: Boolean(mine), check: portalRule.check };
  },
});

/** Mails the agent's own mailbox a test the rule should forward back to us. Never fails the setup. */
async function sendForwardingCheck(accountEmail: string | null): Promise<ForwardingCheck | undefined> {
  const from = checkSender();
  if (!accountEmail || !from || !mailgunConfigured()) return undefined;
  const check: ForwardingCheck = { token: randomBytes(6).toString("hex"), sentAt: new Date().toISOString() };
  try {
    await sendWithMailgun({
      from: { name: "Planner", address: from },
      to: { address: accountEmail },
      subject: checkSubject(check.token),
      text: [
        "This email checks that leads from Immoweb, Zimmo and Immovlan reach your planner.",
        "Your Outlook rule forwards it to us automatically. You don't need to do anything, and you can delete it.",
        "",
        "Deze e-mail controleert of leads van Immoweb, Zimmo en Immovlan in uw planner aankomen. U hoeft niets te doen.",
        "Cet e-mail vérifie que les demandes d'Immoweb, Zimmo et Immovlan arrivent dans votre planning. Aucune action n'est requise.",
      ].join("\n"),
      messageId: newMessageId(),
    });
  } catch (error) {
    check.error = error instanceof Error ? error.message.slice(0, 200) : String(error);
  }
  return check;
}

/** Our test email came back through an agent's rule: forwarding works for that mailbox. */
export async function markForwardingCheck(ctx: ToolContext, token: string) {
  const rows = await ctx.db
    .select({ id: calendarConnections.id, agentId: calendarConnections.agentId, syncState: calendarConnections.syncState })
    .from(calendarConnections)
    .where(and(eq(calendarConnections.agencyId, ctx.agencyId), eq(calendarConnections.provider, "microsoft")));
  const row = rows.find((r) => ruleOf(r.syncState)?.check?.token === token);
  const rule = row && ruleOf(row.syncState);
  if (!row || !rule?.check) return false;
  const portalRule: PortalRule = { ...rule, check: { ...rule.check, receivedAt: new Date().toISOString() } };
  await ctx.db.update(calendarConnections).set({ syncState: { ...row.syncState, portalRule } }).where(eq(calendarConnections.id, row.id));
  await recordEvent(ctx, { type: "portal_forwarding.verified", subjectType: "agent", subjectId: row.agentId, data: {} });
  return true;
}

export const removePortalForwarding = defineTool({
  name: "portal_forwarding_remove",
  description: "Remove the portal-lead forwarding rule from an agent's Outlook.",
  mutates: true,
  input: z.object({ agentId: z.string() }),
  run: async (ctx, input) => {
    const connection = await outlookConnection(ctx, input.agentId);
    const rule = ruleOf(connection.syncState);
    if (rule) {
      const response = await authorizedFetch(ctx, connection, `${graphRules}/${rule.ruleId}`, { method: "DELETE" }).catch((error: Error) => {
        // Already deleted in Outlook by the agent: nothing left to remove.
        if (/ 404 /.test(error.message)) return null;
        throw error;
      });
      void response;
    }
    const { portalRule: _removed, ...rest } = connection.syncState;
    await ctx.db.update(calendarConnections).set({ syncState: rest }).where(eq(calendarConnections.id, connection.id));
    await recordEvent(ctx, { type: "portal_forwarding.removed", subjectType: "agent", subjectId: input.agentId, data: { accountEmail: connection.accountEmail } });
    return { removed: Boolean(rule) };
  },
});

/** Gmail's "(#123456789) Gmail Forwarding Confirmation" mail, in any language. */
export function parseGmailForwardingConfirmation(email: { from: { email: string }; subject: string; text: string }) {
  if (!/forwarding-noreply@google\.com$/i.test(email.from.email)) return null;
  const code = email.subject.match(/\(#(\d{6,})\)/)?.[1] ?? email.text.match(/\b(\d{9})\b/)?.[1];
  if (!code) return null;
  const link = email.text.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s<>"')]+/)?.[0] ?? null;
  const account = email.subject.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;
  return { code, link, account };
}

/** Stores a Gmail forwarding confirmation for Settings, where the agency confirms it. */
export async function storeGmailForwarding(ctx: ToolContext, confirmation: NonNullable<ReturnType<typeof parseGmailForwardingConfirmation>>) {
  const [row] = await ctx.db.select({ channels: agencySettings.channels }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
  const channels = { ...row?.channels, gmailForwarding: { ...confirmation, receivedAt: new Date().toISOString() } };
  await ctx.db.insert(agencySettings).values({ agencyId: ctx.agencyId, channels }).onConflictDoUpdate({ target: agencySettings.agencyId, set: { channels } });
  await recordEvent(ctx, { type: "portal_forwarding.gmail_confirmation", subjectType: "agency", subjectId: ctx.agencyId, data: { account: confirmation.account } });
}

export const setLeadCopyAddress = defineTool({
  name: "portal_leads_set_copy_address",
  description:
    "Set the agency address (e.g. info@agency.be) that gets the copy of a portal lead when the listing's agent has no email or no listing was matched. Empty clears it.",
  mutates: true,
  input: z.object({ address: z.string().trim().toLowerCase().email().or(z.literal("")) }),
  run: async (ctx, input) => {
    const [row] = await ctx.db.select({ channels: agencySettings.channels }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
    const { leadCopyAddress: _old, ...rest } = row?.channels ?? {};
    const channels = input.address ? { ...rest, leadCopyAddress: input.address } : rest;
    await ctx.db.insert(agencySettings).values({ agencyId: ctx.agencyId, channels }).onConflictDoUpdate({ target: agencySettings.agencyId, set: { channels } });
    await recordEvent(ctx, { type: "settings.lead_copy_address_updated", subjectType: "agency", subjectId: ctx.agencyId, data: { address: input.address || null } });
    return { leadCopyAddress: input.address || null };
  },
});
