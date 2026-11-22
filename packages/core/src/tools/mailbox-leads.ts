import { and, db as rootDb, desc, eq, schema, sql } from "@viewing/db";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  graphToInbound,
  isLeadSender,
  leadFields,
  newMessagesUrl,
  SUBSCRIPTION_MINUTES,
  websiteDomain,
  type GraphMessage,
  type GraphMessageHeader,
} from "../channels/mailbox-leads";
import { recordEvent } from "../events";
import { authorizedFetch } from "../integrations/oauth";
import { defineTool, type ToolContext } from "../tool";
import { receiveEmail } from "./channels";
import { PORTAL_RULE_NAME } from "./portal-forwarding";

/*
 * Portal leads read straight from an agent's Outlook, instead of a forwarding
 * rule. Microsoft Graph tells us when a new email arrives (a subscription on
 * the mailbox, renewed daily by the automations cron); we then list what came
 * in since last time by sender only, and open just the emails from the
 * portals or the agency's own website. Those go through the same intake as
 * forwarded lead emails (messages_receive_email with fromMailbox), so a lead
 * becomes a viewing request for the listing's agent exactly the same way.
 * Gmail agents keep forwarding with a filter: reading Gmail needs Google's
 * paid security review.
 */

const { agencySettings, agents, calendarConnections } = schema;
type Connection = typeof calendarConnections.$inferSelect;

export type LeadReading = {
  subscriptionId: string | null;
  clientState: string;
  expiresAt: string | null;
  /** Emails received from this moment on are read; nothing older. */
  since: string;
  /** Received time of the newest email listed so far. */
  cursor: string;
  /** Graph ids of lead emails already taken in near the cursor (the list overlaps a little to miss nothing). */
  seen: string[];
  lastSyncAt?: string;
  lastLeadAt?: string;
  leads?: number;
  /** Why Outlook doesn't notify us right away (the daily check still reads new leads). */
  subscriptionError?: string;
  /** Why the last read failed. */
  error?: string;
};

export const readingOf = (syncState: Record<string, unknown>) => (syncState.leadReading as LeadReading | undefined) ?? null;

const graph = "https://graph.microsoft.com/v1.0";
/** The list goes back this far before the cursor: Outlook can index an email a little after it says it arrived. */
const OVERLAP_MS = 10 * 60 * 1000;
const MAX_PAGES = 10;

/** Where Graph posts new-email notifications. Only reachable on a public https address. */
export function notificationUrl() {
  const host = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  if (!host?.startsWith("https://")) return null;
  return new URL("/api/channels/outlook/notifications", host).toString();
}

async function outlookConnection(ctx: ToolContext, agentId: string) {
  const [connection] = await ctx.db
    .select()
    .from(calendarConnections)
    .where(and(eq(calendarConnections.agencyId, ctx.agencyId), eq(calendarConnections.agentId, agentId), eq(calendarConnections.provider, "microsoft")))
    .orderBy(desc(calendarConnections.createdAt))
    .limit(1);
  return connection ?? null;
}

/** Saves the reading state without touching the rest of syncState (another request may be writing it). */
async function saveReading(ctx: ToolContext, connectionId: string, reading: LeadReading | null) {
  await ctx.db
    .update(calendarConnections)
    .set({ syncState: reading ? sql`jsonb_set(${calendarConnections.syncState}, '{leadReading}', ${JSON.stringify(reading)}::jsonb)` : sql`${calendarConnections.syncState} - 'leadReading'` })
    .where(and(eq(calendarConnections.agencyId, ctx.agencyId), eq(calendarConnections.id, connectionId)));
}

async function deleteSubscription(ctx: ToolContext, connection: Connection, subscriptionId: string | null) {
  if (!subscriptionId) return;
  await authorizedFetch(ctx, connection, `${graph}/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" }).catch((error: Error) => {
    // Already expired or removed at Microsoft.
    if (!/ 404 /.test(error.message)) console.error("Removing the Outlook subscription failed", error);
  });
}

/** Asks Outlook to tell us about each new email. On failure the daily check still reads leads, a day late. */
async function subscribe(ctx: ToolContext, connection: Connection, clientState: string) {
  const url = notificationUrl();
  if (!url) return { subscriptionId: null, expiresAt: null, subscriptionError: "This server has no public https address for Outlook to notify" };
  const expiresAt = new Date(Date.now() + SUBSCRIPTION_MINUTES * 60_000).toISOString();
  try {
    const response = await authorizedFetch(ctx, connection, `${graph}/subscriptions`, {
      method: "POST",
      body: JSON.stringify({ changeType: "created", notificationUrl: url, lifecycleNotificationUrl: url, resource: "me/messages", expirationDateTime: expiresAt, clientState }),
    });
    const body = (await response.json()) as { id: string; expirationDateTime?: string };
    return { subscriptionId: body.id, expiresAt: body.expirationDateTime ?? expiresAt, subscriptionError: undefined };
  } catch (error) {
    return { subscriptionId: null, expiresAt: null, subscriptionError: error instanceof Error ? error.message.slice(0, 300) : String(error) };
  }
}

/** The forwarding rule would bring every lead a second time: reading replaces it. */
async function removeForwardingRule(ctx: ToolContext, connection: Connection) {
  if (!connection.scopes.includes("rules")) return false;
  const rulesUrl = `${graph}/me/mailFolders/inbox/messageRules`;
  const stored = (connection.syncState.portalRule as { ruleId?: string } | undefined)?.ruleId;
  try {
    const existing = (await (await authorizedFetch(ctx, connection, rulesUrl)).json()) as { value: { id: string; displayName: string }[] };
    const ours = existing.value.filter((r) => r.id === stored || r.displayName === PORTAL_RULE_NAME);
    for (const rule of ours) await authorizedFetch(ctx, connection, `${rulesUrl}/${rule.id}`, { method: "DELETE" });
    if (stored) {
      await ctx.db
        .update(calendarConnections)
        .set({ syncState: sql`${calendarConnections.syncState} - 'portalRule'` })
        .where(and(eq(calendarConnections.agencyId, ctx.agencyId), eq(calendarConnections.id, connection.id)));
    }
    return ours.length > 0;
  } catch (error) {
    console.error("Removing the forwarding rule failed", error);
    return false;
  }
}

export const startMailboxLeads = defineTool({
  name: "mailbox_leads_start",
  description:
    "Start reading portal lead emails (Immoweb, Zimmo, Immovlan, Immoscoop, the agency's website form) straight from an agent's connected Outlook, from now on. Only emails from those senders are opened. Replaces the Outlook forwarding rule.",
  mutates: true,
  input: z.object({ agentId: z.string() }),
  run: async (ctx, input) => {
    const connection = await outlookConnection(ctx, input.agentId);
    if (!connection || connection.status !== "active") throw new Error("Connect Outlook for this agent first");
    if (!connection.scopes.includes("leads")) throw new Error("Connect Outlook again to allow reading lead emails");
    const previous = readingOf(connection.syncState);
    await deleteSubscription(ctx, connection, previous?.subscriptionId ?? null);
    const clientState = randomBytes(24).toString("hex");
    const now = new Date().toISOString();
    const subscription = await subscribe(ctx, connection, clientState);
    const reading: LeadReading = {
      clientState,
      since: previous?.since ?? now,
      cursor: previous?.cursor ?? now,
      seen: previous?.seen ?? [],
      leads: previous?.leads ?? 0,
      lastLeadAt: previous?.lastLeadAt,
      ...subscription,
    };
    await saveReading(ctx, connection.id, reading);
    const removedRule = await removeForwardingRule(ctx, connection);
    await recordEvent(ctx, {
      type: "mailbox_leads.started",
      subjectType: "agent",
      subjectId: input.agentId,
      data: { accountEmail: connection.accountEmail, notified: Boolean(subscription.subscriptionId), removedForwardingRule: removedRule },
    });
    return { accountEmail: connection.accountEmail, notified: Boolean(subscription.subscriptionId), subscriptionError: subscription.subscriptionError ?? null, removedForwardingRule: removedRule };
  },
});

export const stopMailboxLeads = defineTool({
  name: "mailbox_leads_stop",
  description: "Stop reading lead emails from an agent's Outlook. Leads already taken in stay.",
  mutates: true,
  input: z.object({ agentId: z.string() }),
  run: async (ctx, input) => {
    const connection = await outlookConnection(ctx, input.agentId);
    const reading = connection && readingOf(connection.syncState);
    if (!connection || !reading) return { stopped: false };
    await deleteSubscription(ctx, connection, reading.subscriptionId);
    await saveReading(ctx, connection.id, null);
    await recordEvent(ctx, { type: "mailbox_leads.stopped", subjectType: "agent", subjectId: input.agentId, data: { accountEmail: connection.accountEmail } });
    return { stopped: true };
  },
});

/** One reader per mailbox at a time; a request that finds it busy leaves a note so the reader goes round once more. */
async function claim(ctx: ToolContext, connectionId: string) {
  const { rows } = await ctx.db.execute<{ id: string }>(sql`
    update ${calendarConnections}
    set sync_state = jsonb_set(sync_state, '{leadSyncLock}', to_jsonb(now() + interval '3 minutes'))
    where id = ${connectionId} and agency_id = ${ctx.agencyId}
      and (sync_state->>'leadSyncLock' is null or (sync_state->>'leadSyncLock')::timestamptz < now())
    returning id`);
  if (rows.length) return true;
  await ctx.db.execute(sql`update ${calendarConnections} set sync_state = jsonb_set(sync_state, '{leadSyncPending}', 'true') where id = ${connectionId} and agency_id = ${ctx.agencyId}`);
  return false;
}

/** Releases the reader; true when another request asked for a read meanwhile. */
async function release(ctx: ToolContext, connectionId: string) {
  await ctx.db.execute(sql`update ${calendarConnections} set sync_state = sync_state - 'leadSyncLock' where id = ${connectionId} and agency_id = ${ctx.agencyId}`);
  const { rows } = await ctx.db.execute<{ id: string }>(sql`
    update ${calendarConnections} set sync_state = sync_state - 'leadSyncPending'
    where id = ${connectionId} and agency_id = ${ctx.agencyId} and sync_state ? 'leadSyncPending'
    returning id`);
  return rows.length > 0;
}

type SyncResult = { listed: number; opened: number; leads: number; ignored: number; failed: number };

type Read = { result: SyncResult; cursor: string; seen: string[]; lastLeadAt?: string };

async function readNewEmails(ctx: ToolContext, connection: Connection, reading: LeadReading, useAi: boolean): Promise<Read> {
  const [settings] = await ctx.db.select({ websiteUrl: agencySettings.websiteUrl }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
  const agentEmails = (await ctx.db.select({ email: agents.email }).from(agents).where(eq(agents.agencyId, ctx.agencyId))).map((a) => a.email).filter((e): e is string => Boolean(e));
  const site = { domain: websiteDomain(settings?.websiteUrl), agentEmails: [...agentEmails, connection.accountEmail] };

  const result: SyncResult = { listed: 0, opened: 0, leads: 0, ignored: 0, failed: 0 };
  const since = new Date(Math.max(new Date(reading.since).getTime(), new Date(reading.cursor).getTime() - OVERLAP_MS));
  const seen = new Set(reading.seen);
  let cursor = reading.cursor;
  let lastLeadAt = reading.lastLeadAt;
  let url: string | undefined = newMessagesUrl(since);
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const body = (await (await authorizedFetch(ctx, connection, url)).json()) as { value: GraphMessageHeader[]; "@odata.nextLink"?: string };
    for (const header of body.value) {
      result.listed++;
      if (new Date(header.receivedDateTime) > new Date(cursor)) cursor = new Date(header.receivedDateTime).toISOString();
      // Only the sender decides whether we open an email: never the subject or content of anything else.
      if (seen.has(header.id) || !isLeadSender(header.from?.emailAddress?.address, site)) continue;
      seen.add(header.id);
      result.opened++;
      try {
        const message = (await (
          await authorizedFetch(ctx, connection, `${graph}/me/messages/${encodeURIComponent(header.id)}?$select=${leadFields}`, { headers: { prefer: 'outlook.body-content-type="text"' } })
        ).json()) as GraphMessage;
        const taken = await receiveEmail.run(ctx, { ...graphToInbound(message, connection.accountEmail), useAi, fromMailbox: true });
        if (taken.kind === "ignored") result.ignored++;
        else {
          result.leads++;
          lastLeadAt = new Date(header.receivedDateTime).toISOString();
        }
      } catch (error) {
        // One unreadable email (a lead without email or phone, say) must not stop the others.
        result.failed++;
        console.error("Reading a lead email failed", header.id, error);
      }
    }
    url = body["@odata.nextLink"];
  }
  // Only the last few hundred ids can come back within the overlap.
  return { result, cursor, seen: [...seen].slice(-300), lastLeadAt };
}

export const syncMailboxLeads = defineTool({
  name: "mailbox_leads_sync",
  description:
    "Read the lead emails that arrived in an agent's Outlook since the last read and take each one in as a viewing request. Only emails from the portals or the agency's website are opened.",
  mutates: true,
  input: z.object({ agentId: z.string(), useAi: z.boolean().default(true) }),
  run: async (ctx, input) => {
    const total: SyncResult = { listed: 0, opened: 0, leads: 0, ignored: 0, failed: 0 };
    const first = await outlookConnection(ctx, input.agentId);
    if (!first || !readingOf(first.syncState)) return { ...total, reading: false as const };
    if (first.status !== "active") return { ...total, reading: true as const, skipped: "expired" as const };
    let held = await claim(ctx, first.id);
    if (!held) return { ...total, reading: true as const, skipped: "busy" as const };
    try {
      for (let round = 0; round < 3; round++) {
        const connection = (await outlookConnection(ctx, input.agentId))!;
        const reading = readingOf(connection.syncState);
        if (!reading) break;
        let read: Read;
        try {
          read = await readNewEmails(ctx, connection, reading, input.useAi);
        } catch (error) {
          await saveReading(ctx, connection.id, { ...reading, lastSyncAt: new Date().toISOString(), error: error instanceof Error ? error.message.slice(0, 300) : String(error) });
          throw error;
        }
        for (const key of Object.keys(total) as (keyof SyncResult)[]) total[key] += read.result[key];
        // Reread: the agent may have stopped or restarted reading meanwhile.
        const latest = await outlookConnection(ctx, input.agentId);
        const current = latest && readingOf(latest.syncState);
        if (current) {
          await saveReading(ctx, connection.id, {
            ...current,
            cursor: read.cursor,
            seen: read.seen,
            lastLeadAt: read.lastLeadAt,
            leads: (current.leads ?? 0) + read.result.leads,
            lastSyncAt: new Date().toISOString(),
            error: undefined,
          });
        }
        held = false;
        if (!(await release(ctx, first.id))) break;
        // A notification came in while we read: go round once more.
        held = await claim(ctx, first.id);
        if (!held) break;
      }
    } finally {
      if (held) await release(ctx, first.id);
    }
    if (total.leads) await recordEvent(ctx, { type: "mailbox_leads.read", subjectType: "agent", subjectId: input.agentId, data: { leads: total.leads, opened: total.opened } });
    return { ...total, reading: true as const };
  },
});

export const renewMailboxLeads = defineTool({
  name: "mailbox_leads_renew",
  description:
    "Daily upkeep of lead reading for every agent of the agency: keep Outlook's new-email notifications alive (or recreate them) and read any lead a missed notification left behind.",
  mutates: true,
  input: z.object({ agentId: z.string().optional(), useAi: z.boolean().default(true) }),
  run: async (ctx, input) => {
    const rows = await ctx.db
      .select()
      .from(calendarConnections)
      .where(
        and(
          eq(calendarConnections.agencyId, ctx.agencyId),
          eq(calendarConnections.provider, "microsoft"),
          sql`${calendarConnections.syncState} ? 'leadReading'`,
          ...(input.agentId ? [eq(calendarConnections.agentId, input.agentId)] : []),
        ),
      );
    const results: { agentId: string; renewed: boolean; leads: number; error?: string }[] = [];
    for (const connection of rows) {
      const reading = readingOf(connection.syncState)!;
      if (connection.status !== "active") {
        results.push({ agentId: connection.agentId, renewed: false, leads: 0, error: "Outlook connection expired" });
        continue;
      }
      try {
        let next: LeadReading = reading;
        const expiresAt = new Date(Date.now() + SUBSCRIPTION_MINUTES * 60_000).toISOString();
        const renewed = reading.subscriptionId
          ? await authorizedFetch(ctx, connection, `${graph}/subscriptions/${encodeURIComponent(reading.subscriptionId)}`, { method: "PATCH", body: JSON.stringify({ expirationDateTime: expiresAt }) })
              .then(() => true)
              .catch(() => false)
          : false;
        if (renewed) next = { ...next, expiresAt, subscriptionError: undefined };
        else next = { ...next, ...(await subscribe(ctx, connection, reading.clientState)) };
        const latest = await outlookConnection(ctx, connection.agentId);
        const current = latest && readingOf(latest.syncState);
        if (current) await saveReading(ctx, connection.id, { ...current, subscriptionId: next.subscriptionId, expiresAt: next.expiresAt, subscriptionError: next.subscriptionError });
        const read = await syncMailboxLeads.run(ctx, { agentId: connection.agentId, useAi: input.useAi });
        results.push({ agentId: connection.agentId, renewed: Boolean(next.subscriptionId), leads: read.leads });
      } catch (error) {
        results.push({ agentId: connection.agentId, renewed: false, leads: 0, error: error instanceof Error ? error.message.slice(0, 200) : String(error) });
      }
    }
    return { mailboxes: results };
  },
});

/** For the daily cron: every agency with an agent whose Outlook is read. */
export async function renewMailboxLeadsForAllAgencies(database = rootDb) {
  const rows = await database
    .selectDistinct({ agencyId: calendarConnections.agencyId })
    .from(calendarConnections)
    .where(and(eq(calendarConnections.provider, "microsoft"), sql`${calendarConnections.syncState} ? 'leadReading'`));
  const results: Record<string, unknown> = {};
  for (const { agencyId } of rows) {
    try {
      results[agencyId] = await renewMailboxLeads.run({ db: database, agencyId, actor: { type: "system", id: null } }, { useAi: true });
    } catch (error) {
      console.error(`Mailbox lead upkeep failed for ${agencyId}`, error);
      results[agencyId] = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  return results;
}
