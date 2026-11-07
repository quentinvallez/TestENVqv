import { and, desc, eq, inArray, schema, sql } from "@viewing/db";
import { z } from "zod";
import { inboundAddress } from "../channels";
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

type PortalRule = { ruleId: string; forwardTo: string; createdAt: string };
const ruleOf = (syncState: Record<string, unknown>) => (syncState.portalRule as PortalRule | undefined) ?? null;

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
      mailboxes: connections.map((c) => ({
        agentId: c.agentId,
        agentName: c.agentName,
        provider: c.provider,
        accountEmail: c.accountEmail,
        active: c.status === "active",
        canForward: c.provider === "microsoft" && c.status === "active" && c.scopes.includes("rules"),
        forwarding: ruleOf(c.syncState),
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
      conditions: { senderContains: [...portalDomains] },
      // Forward (not redirect): the agent keeps the lead in their own inbox too.
      actions: { forwardTo: [{ emailAddress: { address: forwardTo } }], stopProcessingRules: false },
    };
    const existing = (await (await authorizedFetch(ctx, connection, graphRules)).json()) as { value: { id: string; displayName: string }[] };
    const mine = existing.value.find((r) => r.id === ruleOf(connection.syncState)?.ruleId) ?? existing.value.find((r) => r.displayName === PORTAL_RULE_NAME);
    const saved = (await (
      await authorizedFetch(ctx, connection, mine ? `${graphRules}/${mine.id}` : graphRules, { method: mine ? "PATCH" : "POST", body: JSON.stringify(rule) })
    ).json()) as { id: string };
    const portalRule: PortalRule = { ruleId: saved.id ?? mine!.id, forwardTo, createdAt: new Date().toISOString() };
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
    return { ruleId: portalRule.ruleId, accountEmail: connection.accountEmail, forwardTo, updated: Boolean(mine) };
  },
});

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
