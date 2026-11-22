import { runTool, tools } from "@viewing/core";
import { inboundContext, mailboxForSubscription } from "@viewing/core/inbound";
import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Notification = { subscriptionId?: string; clientState?: string; lifecycleEvent?: string };

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Microsoft Graph tells us a new email arrived in an agent's Outlook (or that
 * the subscription needs renewing). The notification carries no content: we
 * check its secret, answer at once, then read what came in since last time,
 * opening only lead emails from the portals and the agency's website.
 */
export async function POST(request: Request) {
  // Graph checks the address when the subscription is created: echo its token as plain text.
  const validationToken = new URL(request.url).searchParams.get("validationToken");
  if (validationToken) return new Response(validationToken, { status: 200, headers: { "content-type": "text/plain" } });

  let notifications: Notification[] = [];
  try {
    notifications = ((await request.json()) as { value?: Notification[] }).value ?? [];
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // One read per mailbox, however many emails the batch announces.
  const jobs = new Map<string, { agencyId: string; agentId: string; renew: boolean }>();
  for (const n of notifications) {
    const mailbox = n.subscriptionId ? await mailboxForSubscription(n.subscriptionId) : null;
    if (!mailbox || !n.clientState || !same(n.clientState, mailbox.clientState)) continue;
    const key = `${mailbox.agencyId}:${mailbox.agentId}`;
    const renew = n.lifecycleEvent === "reauthorizationRequired" || n.lifecycleEvent === "subscriptionRemoved";
    jobs.set(key, { agencyId: mailbox.agencyId, agentId: mailbox.agentId, renew: renew || Boolean(jobs.get(key)?.renew) });
  }

  after(async () => {
    for (const job of jobs.values()) {
      const ctx = inboundContext(job.agencyId, "email");
      try {
        // Renewing also reads what arrived meanwhile ("missed" needs only the read).
        if (job.renew) await runTool(tools.renewMailboxLeads, ctx, { agentId: job.agentId });
        else await runTool(tools.syncMailboxLeads, ctx, { agentId: job.agentId });
      } catch (error) {
        console.error("Reading lead emails failed", job.agentId, error);
      }
    }
  });
  return new Response(null, { status: 202 });
}
