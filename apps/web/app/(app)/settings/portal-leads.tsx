import { runTool, tools, type ToolContext } from "@viewing/core";
import { Inbox } from "lucide-react";
import { Button, Panel, StatusDot } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import { portalForwardingAction, updateAutomationsAction } from "../actions";
import { CopyText } from "./channels";
import { ForwardingButton } from "./forwarding-button";

const portalName = { immoweb: "Immoweb", zimmo: "Zimmo", immovlan: "Immovlan" } as const;
const RECENT = 14 * 24 * 3600 * 1000;

/** Settings → Portal leads: both ways to get Immoweb, Zimmo and Immovlan leads in, and whether they arrive. */
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
      <p className="mb-2 text-muted">Immoweb, Zimmo and Immovlan email each lead to you. Send those emails on to your inbox address in one of two ways; each lead then becomes a lead for the listing&apos;s agent.</p>
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
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">Your inbox address</span>
            {address && <CopyText text={address} />}
          </div>
          <p className="mt-1 font-mono text-[12px] break-all">{address ?? "Not active yet: the platform's mail domain isn't configured."}</p>
        </div>

        <div className="px-4 py-3">
          <div className="font-medium">Option 1 · Forward from your mailbox</div>
          <p className="mt-0.5 max-w-xl text-muted">Leads keep arriving in your own mailbox, and a rule forwards a copy to us. With Outlook connected, we create that rule for you in one click.</p>
          <ul className="mt-3 flex flex-col gap-3">
            {status.mailboxes.length === 0 && (
              <li className="text-muted">
                No mailbox connected yet. Connect Outlook on the{" "}
                <a href="/agents" className="underline underline-offset-2">
                  Agents
                </a>{" "}
                page for one-click forwarding, or follow the steps below.
              </li>
            )}
            {status.mailboxes.map((m) => (
              <li key={`${m.agentId}-${m.provider}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-2">
                  <StatusDot color={m.forwarding ? "var(--success)" : "var(--line-strong)"} className="mt-1.5" />
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
                            ? `Forwarding portal emails since ${formatRelative(new Date(m.forwarding.createdAt))}.`
                            : m.canForward
                              ? "Not forwarding yet."
                              : "Connect Outlook again to allow us to create the rule."}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  {m.provider === "microsoft" && m.canForward && address && (
                    <ForwardingButton
                      action={portalForwardingAction.bind(null, m.agentId, Boolean(m.forwarding))}
                      label={m.forwarding ? "Remove rule" : "Set up forwarding"}
                      variant={m.forwarding ? "secondary" : "primary"}
                    />
                  )}
                  {m.provider === "microsoft" && (!m.canForward || !m.active) && status.outlookAvailable && (
                    <a href={`/api/calendar/microsoft/start?agentId=${m.agentId}`} className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium hover:bg-hover">
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
                Settings → Mail → Rules → Add new rule. Condition: <i>From</i> contains <code>immoweb.be</code>, <code>zimmo.be</code>, <code>immovlan.be</code>. Action: <i>Forward to</i> your inbox address.
              </div>
              <div>
                <div className="font-medium text-fg">Microsoft 365 companies</div>
                Many block forwarding outside the company by default. Your IT admin allows it once: Microsoft Defender → Policies → Anti-spam → Outbound policy → Automatic forwarding <i>On</i>. Without it the rule exists but nothing arrives.
              </div>
              <div>
                <div className="font-medium text-fg">Gmail</div>
                Settings → See all settings → Forwarding and POP/IMAP → Add a forwarding address: your inbox address. The confirmation code appears here above. Then Filters → Create a filter: From <code>immoweb.be OR zimmo.be OR immovlan.be</code> → Forward it to that address.
              </div>
            </div>
          </details>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-medium">Option 2 · Let the portals send leads to us</div>
            <p className="mt-0.5 max-w-xl text-muted">
              In your Immoweb, Zimmo and Immovlan accounts, set the email address for leads to your inbox address. Nothing depends on your mailbox, but the portal emails no longer reach it, so we can send each lead on to the listing&apos;s agent.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-muted">Copy of each lead to the agent:</span>
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
      </Panel>
    </section>
  );
}
