import { runTool, tools, type ToolContext } from "@viewing/core";
import { Inbox } from "lucide-react";
import { Button, Panel, StatusDot } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import { disconnectOfficeMailboxAction, leadCopyAddressAction, mailboxLeadsAction, portalForwardingAction, updateAutomationsAction } from "../actions";
import { CopyText } from "./channels";
import { CopyAddressForm, ForwardingButton } from "./forwarding-button";

const portalName = { immoweb: "Immoweb", zimmo: "Zimmo", immovlan: "Immovlan", immoscoop: "Immoscoop" } as const;
const RECENT = 14 * 24 * 3600 * 1000;

const dotColor: Record<string, string> = {
  working: "var(--success)",
  checking: "var(--warning)",
  blocked: "var(--danger)",
  untested: "var(--success)",
  none: "var(--line-strong)",
};

function stateText(state: string | null, since: string) {
  if (state === "working") return `Forwarding works: our test email came back. Rule active since ${formatRelative(new Date(since))}.`;
  if (state === "checking") return "Rule created. Checking that Outlook really forwards: refresh in a few minutes.";
  if (state === "blocked") return "Rule created, but our test email never came back: forwarding is blocked.";
  return `Forwarding portal emails since ${formatRelative(new Date(since))}.`;
}

function readingText(reading: { since: string; lastSyncAt: string | null; lastLeadAt: string | null; leads: number; instant: boolean; error: string | null }) {
  if (reading.error) return `Reading failed: ${reading.error.slice(0, 160)}`;
  const leads = reading.lastLeadAt ? `${reading.leads} lead${reading.leads === 1 ? "" : "s"} read, last ${formatRelative(new Date(reading.lastLeadAt))}` : "No lead emails yet";
  const when = reading.instant ? "as they arrive" : "once a day (Outlook isn't notifying us right away; try Stop and Start reading)";
  return `Reading new lead emails ${when}, started ${formatRelative(new Date(reading.since))}. ${leads}.`;
}

type MailboxStatus = Awaited<ReturnType<typeof tools.portalLeadsStatus.run>>["mailboxes"][number];

/** One mailbox we read (or could read) lead emails from: an agent's Outlook, or the office mailbox. */
function MailboxRow({ m, outlookAvailable, reconnectHref }: { m: MailboxStatus; outlookAvailable: boolean; reconnectHref: string }) {
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
              ? `${gmail ? "Gmail" : "Outlook"} connection expired: connect again.`
              : gmail
                ? "Gmail: replies go out from this address when the listing's agent has no mailbox. Google doesn't let us read Gmail, so forward its lead emails with the filter in option 2."
                : m.reading
                  ? readingText(m.reading)
                  : m.canRead
                    ? "Not reading lead emails."
                    : "Connect Outlook again to allow reading lead emails."}
            {office && m.active && !gmail && m.sends ? " Replies go out from this address when the listing's agent has no mailbox." : ""}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5 sm:flex-col sm:items-end">
        {m.active && m.canRead && (
          <ForwardingButton action={mailboxLeadsAction.bind(null, m.connectionId, Boolean(m.reading))} label={m.reading ? "Stop reading" : "Start reading"} variant={m.reading ? "secondary" : "primary"} />
        )}
        {!gmail && (!m.canRead || !m.active) && outlookAvailable && (
          <a href={reconnectHref} className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium hover:bg-hover">
            Connect Outlook again
          </a>
        )}
        {office && <ForwardingButton action={disconnectOfficeMailboxAction.bind(null, m.connectionId)} label="Disconnect" variant="secondary" />}
      </div>
    </li>
  );
}

/** Settings → Portal leads: the ways Immoweb, Zimmo, Immovlan and Immoscoop leads come in, and whether they arrive. */
export async function PortalLeads({ ctx, copies }: { ctx: ToolContext; copies: boolean }) {
  const status = await runTool(tools.portalLeadsStatus, ctx, {});
  const address = status.inboundAddress;
  const gmail = status.gmailForwarding;
  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 font-medium">
        <Inbox className="size-4 text-muted" />
        Portal leads
      </h2>
      <p className="mb-2 text-muted">Immoweb, Zimmo, Immovlan, Immoscoop and your website email each lead to you, usually at your general address. From Outlook (your office mailbox or the agents&apos; own) we pick those emails up ourselves; from Gmail you forward them to your inbox address. Each lead becomes a viewing request for the listing&apos;s agent.</p>
      <Panel className="divide-y divide-line">
        <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3">
          {status.portals.map((p) => {
            const recent = p.lastAt && Date.now() - p.lastAt.getTime() < RECENT;
            return (
              <div key={p.portal} className="flex items-center gap-2">
                <StatusDot color={recent ? "var(--success)" : p.lastAt ? "var(--warning)" : "var(--line-strong)"} />
                <span className="font-medium">{portalName[p.portal]}</span>
                <span className="text-[12px] text-muted">{p.lastAt ? `last lead ${formatRelative(p.lastAt)} · ${p.count} in total` : "no leads yet"}</span>
              </div>
            );
          })}
        </div>


        <div className="px-4 py-3">
          <div className="flex items-center gap-2 font-medium">
            Read lead emails from your mailboxes
            <span className="rounded-full border border-line px-1.5 text-[11px] font-normal text-muted">Recommended</span>
          </div>
          <p className="mt-0.5 max-w-xl text-muted">
            Connect your office mailbox (the address the portals and your website write to, like info@) once here; agents connect their own Outlook on their page. We pick up new lead emails as they arrive, and the reply with the booking link goes out from the listing&apos;s agent, or from the office mailbox when that agent has none. We only open emails sent by Immoweb, Zimmo, Immovlan, Immoscoop
            {status.websiteDomain ? <> and your website ({status.websiteDomain})</> : null}. For every other email we only look at the sender to skip it, and never open it. Emails that arrived before reading started are left alone.
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {status.office ? (
              <MailboxRow m={status.office} outlookAvailable={status.outlookAvailable} reconnectHref={`/api/calendar/${status.office.provider}/start?office=1`} />
            ) : (
              <li className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-2">
                  <StatusDot color="var(--line-strong)" className="mt-1.5" />
                  <div className="min-w-0">
                    <div>Office mailbox</div>
                    <div className="text-[12px] text-muted">Not connected. Sign in with your general address (info@…) to read its lead emails and send replies from it.</div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {(["microsoft", "google"] as const)
                    .filter((p) => (p === "microsoft" ? status.outlookAvailable : status.googleAvailable))
                    .map((p) => (
                      <a key={p} href={`/api/calendar/${p}/start?office=1`} className={`inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium ${p === "microsoft" ? "bg-primary text-primary-fg hover:opacity-90" : "border border-line hover:bg-hover"}`}>
                        Connect {p === "microsoft" ? "Outlook" : "Gmail"}
                      </a>
                    ))}
                </div>
              </li>
            )}
            {status.mailboxes
              .filter((m) => m.provider === "microsoft")
              .map((m) => (
                <MailboxRow key={m.connectionId} m={m} outlookAvailable={status.outlookAvailable} reconnectHref={`/api/calendar/microsoft/start?agentId=${m.agentId}`} />
              ))}
          </ul>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">Your inbox address</span>
            {address && <CopyText text={address} />}
          </div>
          <p className="mt-1 font-mono text-[12px] break-all">{address ?? "Not active yet: the platform's mail domain isn't configured."}</p>
        </div>

        <div className="px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium">
                Option 1 · Let the portals send leads to us
              </div>
              <p className="mt-0.5 max-w-xl text-muted">
                In your Immoweb, Zimmo, Immovlan and Immoscoop accounts, set the email address that receives contact requests to your inbox address above. Nothing to set up in your mailbox: we forward each original portal email to the listing&apos;s agent, so nobody misses a lead, and replying to it goes straight to the client.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-muted">Forward each portal email to the agent:</span>
                <span className="flex items-center gap-1.5">
                  <StatusDot color={copies ? "var(--success)" : "var(--line-strong)"} />
                  {copies ? "On" : "Off"}
                </span>
              </div>
            </div>
            <form action={updateAutomationsAction.bind(null, { portalLeadCopies: !copies })} className="shrink-0">
              <Button type="submit">{copies ? "Turn off" : "Turn on"}</Button>
            </form>
          </div>
          {copies && (
            <div className="mt-3">
              <div className="text-muted">When the agent has no email address, or the listing isn&apos;t recognised, send it to:</div>
              <div className="mt-1">
                <CopyAddressForm action={leadCopyAddressAction} value={status.leadCopyAddress} />
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3">
          <div className="font-medium">Option 2 · Forward from your mailbox (Gmail)</div>
          <p className="mt-0.5 max-w-xl text-muted">For Gmail, and for Outlook mailboxes we don&apos;t read: a rule forwards a copy of each portal email to your inbox address. With Outlook connected, we create that rule in one click. With a Gmail filter, turn off the forwarding to agents above, or they get each lead twice.</p>
          <ul className="mt-3 flex flex-col gap-3">
            {status.mailboxes.filter((m) => !m.reading).length === 0 && (
              <li className="text-muted">
                Nothing to forward: every connected Outlook is read directly. For Gmail, follow the steps below.
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
                        ? "Gmail: add the filter yourself (steps below)."
                        : !m.active
                          ? "Outlook connection expired."
                          : m.forwarding
                            ? stateText(m.forwardingState, m.forwarding.createdAt)
                            : m.canForward
                              ? "Not forwarding yet."
                              : "Connect Outlook again to allow us to create the rule."}
                    </div>
                    {m.forwardingState === "blocked" && (
                      <div className="mt-1.5 max-w-xl text-[12px] text-muted">
                        Microsoft 365 blocks forwarding to outside addresses unless an admin allows it. Your IT admin turns it on once at security.microsoft.com → Policies &amp; rules → Threat policies → Anti-spam → Anti-spam outbound policy (Default) → Forwarding rules: <i>On</i>, then click Test again. Also check that the test email didn&apos;t land in Junk. Or use option 1, which needs no mailbox settings.
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5 sm:flex-col sm:items-end">
                  {m.provider === "microsoft" && m.canForward && address && m.forwarding && m.forwardingState !== "working" && m.forwardingState !== "checking" && (
                    <ForwardingButton action={portalForwardingAction.bind(null, m.agentId!, false)} label="Test again" variant="primary" />
                  )}
                  {m.provider === "microsoft" && m.canForward && address && (
                    <ForwardingButton
                      action={portalForwardingAction.bind(null, m.agentId!, Boolean(m.forwarding))}
                      label={m.forwarding ? "Remove rule" : "Set up forwarding"}
                      variant={m.forwarding ? "secondary" : "primary"}
                    />
                  )}
                  {m.provider === "microsoft" && (!m.canForward || !m.active) && status.outlookAvailable && (
                    <a href={`/api/calendar/microsoft/start?agentId=${m.agentId!}`} className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium hover:bg-hover">
                      Connect Outlook again
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {gmail && (
            <div className="mt-3 rounded-md border border-line px-3 py-2">
              <div className="font-medium">Gmail asks to confirm forwarding{gmail.account ? ` from ${gmail.account}` : ""}</div>
              <p className="mt-0.5 text-muted">
                Confirmation code <span className="font-mono text-fg">{gmail.code}</span>
                {gmail.link && (
                  <>
                    {" "}
                    or{" "}
                    <a href={gmail.link} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      confirm in Gmail
                    </a>
                  </>
                )}
                . Received {formatRelative(new Date(gmail.receivedAt))}.
              </p>
            </div>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-muted">Set the rule up yourself</summary>
            <div className="mt-2 flex max-w-xl flex-col gap-3 text-muted">
              <div>
                <div className="font-medium text-fg">Outlook</div>
                Settings → Mail → Rules → Add new rule. Condition: <i>From</i> contains <code>immoweb.be</code>, <code>zimmo.be</code>, <code>immovlan.be</code>, <code>immoscoop.be</code>. Action: <i>Forward to</i> your inbox address.
              </div>
              <div>
                <div className="font-medium text-fg">Microsoft 365 companies</div>
                Many block forwarding outside the company by default. Your IT admin allows it once: Microsoft Defender → Policies → Anti-spam → Outbound policy → Automatic forwarding <i>On</i>. Without it the rule exists but nothing arrives.
              </div>
              <div>
                <div className="font-medium text-fg">Gmail</div>
                Settings → See all settings → Forwarding and POP/IMAP → Add a forwarding address: your inbox address. The confirmation code appears here above. Then Filters → Create a filter: From <code>immoweb.be OR zimmo.be OR immovlan.be OR immoscoop.be</code> → Forward it to that address.
              </div>
            </div>
          </details>
        </div>

      </Panel>
    </section>
  );
}
