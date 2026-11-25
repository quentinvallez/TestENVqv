import { runTool, tools, type ToolContext } from "@viewing/core";
import { Inbox } from "lucide-react";
import { Button, Panel, StatusDot } from "@/components/ui";
import type { T } from "@/lib/i18n";
import { disconnectOfficeMailboxAction, leadCopyAddressAction, mailboxLeadsAction, portalForwardingAction, updateAutomationsAction } from "../actions";
import { CopyText } from "./channels";
import { CopyAddressForm, ForwardingButton } from "./forwarding-button";
import { getT } from "@/lib/i18n/server";

const portalName = { immoweb: "Immoweb", zimmo: "Zimmo", immovlan: "Immovlan", immoscoop: "Immoscoop" } as const;
const RECENT = 14 * 24 * 3600 * 1000;

const dotColor: Record<string, string> = {
  working: "var(--success)",
  checking: "var(--warning)",
  blocked: "var(--danger)",
  untested: "var(--success)",
  none: "var(--line-strong)",
};

function stateText(t: T, state: string | null, since: string) {
  if (state === "working") return t("Forwarding works: our test email came back. Rule active since {when}.", { when: t.relative(new Date(since)) });
  if (state === "checking") return t("Rule created. Checking that Outlook really forwards: refresh in a few minutes.");
  if (state === "blocked") return t("Rule created, but our test email never came back: forwarding is blocked.");
  return t("Forwarding portal emails since {when}.", { when: t.relative(new Date(since)) });
}

function readingText(t: T, reading: { since: string; lastSyncAt: string | null; lastLeadAt: string | null; leads: number; instant: boolean; error: string | null }) {
  if (reading.error) return t("Reading failed: {error}", { error: reading.error.slice(0, 160) });
  const leads = reading.lastLeadAt
    ? reading.leads === 1
      ? t("1 lead read, last {when}", { when: t.relative(new Date(reading.lastLeadAt)) })
      : t("{n} leads read, last {when}", { n: reading.leads, when: t.relative(new Date(reading.lastLeadAt)) })
    : t("No lead emails yet");
  const since = t.relative(new Date(reading.since));
  return reading.instant
    ? `${t("Reading new lead emails as they arrive, started {when}.", { when: since })} ${leads}.`
    : `${t("Reading new lead emails once a day (Outlook isn't notifying us right away; try Stop and Start reading), started {when}.", { when: since })} ${leads}.`;
}

type MailboxStatus = Awaited<ReturnType<typeof tools.portalLeadsStatus.run>>["mailboxes"][number];

/** One mailbox we read (or could read) lead emails from: an agent's Outlook, or the office mailbox. */
async function MailboxRow({ m, outlookAvailable, reconnectHref }: { m: MailboxStatus; outlookAvailable: boolean; reconnectHref: string }) {
  const t = await getT();
  const office = !m.agentId;
  const gmail = m.provider === "google";
  return (
    <li className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        <StatusDot color={m.reading && m.active ? (m.reading.error ? "var(--danger)" : m.reading.instant ? "var(--success)" : "var(--warning)") : gmail && m.active ? "var(--success)" : "var(--line-strong)"} className="mt-1.5" />
        <div className="min-w-0">
          <div className="truncate">
            {m.agentName} <span className="text-muted">· {m.accountEmail}</span>
          </div>
          <div className="text-[12px] text-muted">
            {!m.active
              ? t("{provider} connection expired: connect again.", { provider: gmail ? "Gmail" : "Outlook" })
              : gmail
                ? `Gmail: ${m.sendsForAgents ? `${t("replies go out from this address when the listing's agent has no mailbox.")} ` : ""}${t("Google doesn't let us read Gmail, so forward its lead emails with the filter in option 2.")}`
                : m.reading
                  ? readingText(t, m.reading)
                  : m.canRead
                    ? t("Not reading lead emails.")
                    : t("Connect Outlook again to allow reading lead emails.")}
            {m.sendsForAgents && !gmail ? ` ${t("Replies go out from this address when the listing's agent has no mailbox.")}` : ""}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5 sm:flex-col sm:items-end">
        {m.active && m.canRead && (
          <ForwardingButton action={mailboxLeadsAction.bind(null, m.connectionId, Boolean(m.reading))} label={m.reading ? t("Stop reading") : t("Start reading")} variant={m.reading ? "secondary" : "primary"} />
        )}
        {!gmail && (!m.canRead || !m.active) && outlookAvailable && (
          <a href={reconnectHref} className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium hover:bg-hover">
            {t("Connect Outlook again")}
          </a>
        )}
        {office && <ForwardingButton action={disconnectOfficeMailboxAction.bind(null, m.connectionId)} label={t("Disconnect")} variant="secondary" />}
      </div>
    </li>
  );
}

/** Settings → Portal leads: the ways Immoweb, Zimmo, Immovlan and Immoscoop leads come in, and whether they arrive. */
export async function PortalLeads({ ctx, copies }: { ctx: ToolContext; copies: boolean }) {
  const t = await getT();
  const status = await runTool(tools.portalLeadsStatus, ctx, {});
  const address = status.inboundAddress;
  const gmail = status.gmailForwarding;
  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 font-medium">
        <Inbox className="size-4 text-muted" />
        {t("Portal leads")}
      </h2>
      <p className="mb-2 text-muted">{t("Immoweb, Zimmo, Immovlan, Immoscoop and your website email each lead to you, usually at your general address. From Outlook (your office mailbox or the agents' own) we pick those emails up ourselves; from Gmail you forward them to your inbox address. Each lead becomes a viewing request for the listing's agent.")}</p>
      <Panel className="divide-y divide-line">
        <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3">
          {status.portals.map((p) => {
            const recent = p.lastAt && Date.now() - p.lastAt.getTime() < RECENT;
            return (
              <div key={p.portal} className="flex items-center gap-2">
                <StatusDot color={recent ? "var(--success)" : p.lastAt ? "var(--warning)" : "var(--line-strong)"} />
                <span className="font-medium">{portalName[p.portal]}</span>
                <span className="text-[12px] text-muted">{p.lastAt ? t("last lead {when} · {n} in total", { when: t.relative(p.lastAt), n: p.count }) : t("no leads yet")}</span>
              </div>
            );
          })}
        </div>


        <div className="px-4 py-3">
          <div className="flex items-center gap-2 font-medium">
            {t("Read lead emails from your mailboxes")}
            <span className="rounded-full border border-line px-1.5 text-[11px] font-normal text-muted">{t("Recommended")}</span>
          </div>
          <p className="mt-0.5 max-w-xl text-muted">
            {t("Connect the mailbox where your portal and website requests arrive (any address) once here; agents connect their own Outlook on their page. We pick up new lead emails as they arrive, and the reply with the booking link goes out from the listing's agent, or from your first office mailbox when that agent has none.")}{" "}
            {status.websiteDomain
              ? t("We only open emails sent by Immoweb, Zimmo, Immovlan, Immoscoop and your website ({domain}).", { domain: status.websiteDomain })
              : t("We only open emails sent by Immoweb, Zimmo, Immovlan and Immoscoop.")}{" "}
            {t("For every other email we only look at the sender to skip it, and never open it. Emails that arrived before reading started are left alone.")}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {status.offices.map((m) => (
              <MailboxRow key={m.connectionId} m={m} outlookAvailable={status.outlookAvailable} reconnectHref={`/api/calendar/${m.provider}/start?office=1`} />
            ))}
            <li className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2">
                <StatusDot color="var(--line-strong)" className="mt-1.5" />
                <div className="min-w-0">
                  <div>{status.offices.length ? t("Another mailbox where requests arrive") : t("The mailbox where your requests arrive")}</div>
                  <div className="text-[12px] text-muted">
                    {t("Sign in with the address your portal accounts and website send requests to, whatever its name (info@, contact@, verkoop@…). Leads in several places? Connect each one.")}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {(["microsoft", "google"] as const)
                  .filter((p) => (p === "microsoft" ? status.outlookAvailable : status.googleAvailable))
                  .map((p) => (
                    <a
                      key={p}
                      href={`/api/calendar/${p}/start?office=1`}
                      className={`inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium ${p === "microsoft" && !status.offices.length ? "bg-primary text-primary-fg hover:opacity-90" : "border border-line hover:bg-hover"}`}
                    >
                      {t("Connect {provider}", { provider: p === "microsoft" ? "Outlook" : "Gmail" })}
                    </a>
                  ))}
              </div>
            </li>
            {status.mailboxes
              .filter((m) => m.provider === "microsoft")
              .map((m) => (
                <MailboxRow key={m.connectionId} m={m} outlookAvailable={status.outlookAvailable} reconnectHref={`/api/calendar/microsoft/start?agentId=${m.agentId}`} />
              ))}
          </ul>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{t("Your inbox address")}</span>
            {address && <CopyText text={address} />}
          </div>
          <p className="mt-1 font-mono text-[12px] break-all">{address ?? t("Not active yet: the platform's mail domain isn't configured.")}</p>
        </div>

        <div className="px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium">
                {t("Option 1 · Let the portals send leads to us")}
              </div>
              <p className="mt-0.5 max-w-xl text-muted">
                {t("In your Immoweb, Zimmo, Immovlan and Immoscoop accounts, set the email address that receives contact requests to your inbox address above. Nothing to set up in your mailbox: we forward each original portal email to the listing's agent, so nobody misses a lead, and replying to it goes straight to the client.")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-muted">{t("Forward each portal email to the agent:")}</span>
                <span className="flex items-center gap-1.5">
                  <StatusDot color={copies ? "var(--success)" : "var(--line-strong)"} />
                  {copies ? t("On") : t("Off")}
                </span>
              </div>
            </div>
            <form action={updateAutomationsAction.bind(null, { portalLeadCopies: !copies })} className="shrink-0">
              <Button type="submit">{copies ? t("Turn off") : t("Turn on")}</Button>
            </form>
          </div>
          {copies && (
            <div className="mt-3">
              <div className="text-muted">{t("When the agent has no email address, or the listing isn't recognised, send it to:")}</div>
              <div className="mt-1">
                <CopyAddressForm action={leadCopyAddressAction} value={status.leadCopyAddress} />
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3">
          <div className="font-medium">{t("Option 2 · Forward from your mailbox (Gmail)")}</div>
          <p className="mt-0.5 max-w-xl text-muted">{t("For Gmail, and for Outlook mailboxes we don't read: a rule forwards a copy of each portal email to your inbox address. With Outlook connected, we create that rule in one click. With a Gmail filter, turn off the forwarding to agents above, or they get each lead twice.")}</p>
          <ul className="mt-3 flex flex-col gap-3">
            {status.mailboxes.filter((m) => !m.reading).length === 0 && (
              <li className="text-muted">
                {t("Nothing to forward: every connected Outlook is read directly. For Gmail, follow the steps below.")}
              </li>
            )}
            {status.mailboxes
              .filter((m) => !m.reading)
              .map((m) => (
              <li key={`${m.agentId}-${m.provider}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-2">
                  <StatusDot color={dotColor[m.forwardingState ?? "none"]!} className="mt-1.5" />
                  <div className="min-w-0">
                    <div className="truncate">
                      {m.agentName} <span className="text-muted">· {m.accountEmail}</span>
                    </div>
                    <div className="text-[12px] text-muted">
                      {m.provider === "google"
                        ? t("Gmail: add the filter yourself (steps below).")
                        : !m.active
                          ? t("Outlook connection expired.")
                          : m.forwarding
                            ? stateText(t, m.forwardingState, m.forwarding.createdAt)
                            : m.canForward
                              ? t("Not forwarding yet.")
                              : t("Connect Outlook again to allow us to create the rule.")}
                    </div>
                    {m.forwardingState === "blocked" && (
                      <div className="mt-1.5 max-w-xl text-[12px] text-muted">
                        {t.rich(
                          "Microsoft 365 blocks forwarding to outside addresses unless an admin allows it. Your IT admin turns it on once at security.microsoft.com → Policies & rules → Threat policies → Anti-spam → Anti-spam outbound policy (Default) → Forwarding rules: <i>On</i>, then click Test again. Also check that the test email didn't land in Junk. Or use option 1, which needs no mailbox settings.",
                          { i: (c) => <i>{c}</i> },
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5 sm:flex-col sm:items-end">
                  {m.provider === "microsoft" && m.canForward && address && m.forwarding && m.forwardingState !== "working" && m.forwardingState !== "checking" && (
                    <ForwardingButton action={portalForwardingAction.bind(null, m.agentId!, false)} label={t("Test again")} variant="primary" />
                  )}
                  {m.provider === "microsoft" && m.canForward && address && (
                    <ForwardingButton
                      action={portalForwardingAction.bind(null, m.agentId!, Boolean(m.forwarding))}
                      label={m.forwarding ? t("Remove rule") : t("Set up forwarding")}
                      variant={m.forwarding ? "secondary" : "primary"}
                    />
                  )}
                  {m.provider === "microsoft" && (!m.canForward || !m.active) && status.outlookAvailable && (
                    <a href={`/api/calendar/microsoft/start?agentId=${m.agentId!}`} className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium hover:bg-hover">
                      {t("Connect Outlook again")}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {gmail && (
            <div className="mt-3 rounded-md border border-line px-3 py-2">
              <div className="font-medium">{gmail.account ? t("Gmail asks to confirm forwarding from {account}", { account: gmail.account }) : t("Gmail asks to confirm forwarding")}</div>
              <p className="mt-0.5 text-muted">
                {t("Confirmation code")} <span className="font-mono text-fg">{gmail.code}</span>
                {gmail.link && (
                  <>
                    {" "}
                    {t("or")}{" "}
                    <a href={gmail.link} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {t("confirm in Gmail")}
                    </a>
                  </>
                )}
                . {t("Received {when}.", { when: t.relative(new Date(gmail.receivedAt)) })}
              </p>
            </div>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-muted">{t("Set the rule up yourself")}</summary>
            <div className="mt-2 flex max-w-xl flex-col gap-3 text-muted">
              <div>
                <div className="font-medium text-fg">Outlook</div>
                {t.rich(
                  "Settings → Mail → Rules → Add new rule. Condition: <i>From</i> contains <c>immoweb.be, zimmo.be, immovlan.be, immoscoop.be</c>. Action: <i>Forward to</i> your inbox address.",
                  { i: (c) => <i>{c}</i>, c: (c) => <code>{c}</code> },
                )}
              </div>
              <div>
                <div className="font-medium text-fg">{t("Microsoft 365 companies")}</div>
                {t.rich(
                  "Many block forwarding outside the company by default. Your IT admin allows it once: Microsoft Defender → Policies → Anti-spam → Outbound policy → Automatic forwarding <i>On</i>. Without it the rule exists but nothing arrives.",
                  { i: (c) => <i>{c}</i> },
                )}
              </div>
              <div>
                <div className="font-medium text-fg">Gmail</div>
                {t.rich(
                  "Settings → See all settings → Forwarding and POP/IMAP → Add a forwarding address: your inbox address. The confirmation code appears here above. Then Filters → Create a filter: From <c>immoweb.be OR zimmo.be OR immovlan.be OR immoscoop.be</c> → Forward it to that address.",
                  { c: (c) => <code>{c}</code> },
                )}
              </div>
            </div>
          </details>
        </div>

      </Panel>
    </section>
  );
}
