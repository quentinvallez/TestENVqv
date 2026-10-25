import { runTool, tools } from "@viewing/core";
import { db, eq, schema } from "@viewing/db";
import { Palette, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { ChannelMark } from "@/components/channel";
import { AiPill, PageHeader, Panel, Pill, StatusDot } from "@/components/ui";
import { getSession, getToolContext } from "@/lib/context";
import { connectWhatsAppAction, disconnectWhatsAppAction } from "../actions";
import { CopyText, WhatsAppForm } from "./channels";

const capabilities = [
  ["Reply to new portal leads with a booking link", "act"],
  ["Send confirmations and reminders", "act"],
  ["Handle cancellations and reschedules from replies", "suggest"],
  ["Reassign a lead to another agent", "suggest"],
] as const;

const autonomyLabel = { suggest: "Ask me first", act_and_notify: "Do it and tell me", act: "Do it" };

export default async function SettingsPage() {
  const { agency } = await getSession();
  const channels = await runTool(tools.channelsStatus, await getToolContext(), {});
  const settings = await db.query.agencySettings.findFirst({ where: eq(schema.agencySettings.agencyId, agency.id) });
  const sendingMailboxes = channels.mailboxes.filter((m) => m.sends);

  return (
    <>
      <PageHeader crumbs={[{ label: "Settings" }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-5 py-6">
          <section>
            <h2 className="mb-2 font-medium">Agency</h2>
            <Panel className="divide-y divide-line">
              {[
                ["Name", agency.name],
                ["Website", settings?.websiteUrl ?? "Not set"],
                ["Default language", (settings?.defaultLanguage ?? "nl").toUpperCase()],
                ["Time zone", settings?.timezone ?? "Europe/Brussels"],
                ["Data location", "EU · Frankfurt"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-muted">{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </Panel>
          </section>

          <section>
            <h2 className="mb-1 flex items-center gap-2 font-medium">
              <Radio className="size-4 text-muted" />
              Channels
            </h2>
            <p className="mb-2 text-muted">How messages to clients go out, and how replies and portal leads come in. Nothing is sent without your approval.</p>
            <Panel className="divide-y divide-line">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">Inbox address</span>
                  {channels.inboundAddress && <CopyText text={channels.inboundAddress} />}
                </div>
                {channels.inboundAddress ? (
                  <>
                    <p className="mt-1 font-mono text-[12px] break-all">{channels.inboundAddress}</p>
                    <p className="mt-1 text-[12px] text-muted">
                      Client replies come back here automatically. Forward your Immoweb, Zimmo and Immovlan lead emails to it (a forwarding rule in your mailbox) and each one becomes a lead for the listing&apos;s agent with a draft reply.
                      {channels.portalLeads > 0 && ` ${channels.portalLeads} portal leads so far.`}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 flex items-center gap-1.5 text-muted">
                    <StatusDot color="var(--line-strong)" />
                    Not active yet: the platform&apos;s mail domain isn&apos;t configured.
                  </p>
                )}
              </div>
              <div className="flex items-start gap-3 px-4 py-3">
                <ChannelMark provider="email" size={18} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Email</div>
                  <p className="text-[12px] text-muted">
                    {sendingMailboxes.length > 0
                      ? `${sendingMailboxes.length} agent${sendingMailboxes.length === 1 ? "" : "s"} send from their own mailbox (${sendingMailboxes.map((m) => m.agentName).join(", ")}). `
                      : "Agents can connect Google or Outlook on their page to send from their own mailbox. "}
                    {channels.email.agencySending ? "Others send from the inbox address." : "Without a mailbox, email stays a draft that isn't delivered."}
                  </p>
                </div>
                <StatusDot color={sendingMailboxes.length || channels.email.agencySending ? "var(--success)" : "var(--line-strong)"} className="mt-1.5" />
              </div>
              <div className="flex items-start gap-3 px-4 py-3">
                <ChannelMark provider="whatsapp_business" size={18} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">WhatsApp</div>
                  <p className="mb-2 text-[12px] text-muted">
                    {channels.whatsapp.status === "own"
                      ? `Your business number ${channels.whatsapp.number}.`
                      : channels.whatsapp.status === "platform"
                        ? `Using the shared pilot number${channels.whatsapp.number ? ` ${channels.whatsapp.number}` : ""}. Connect your own number so clients see your agency's name.`
                        : "Not connected: WhatsApp replies stay drafts that aren't delivered."}
                  </p>
                  {channels.whatsapp.status === "own" ? (
                    <form action={disconnectWhatsAppAction}>
                      <button className="text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline">Disconnect</button>
                    </form>
                  ) : channels.canStoreTokens ? (
                    <WhatsAppForm action={connectWhatsAppAction} />
                  ) : null}
                </div>
                <StatusDot color={channels.whatsapp.status === "none" ? "var(--line-strong)" : "var(--success)"} className="mt-1.5" />
              </div>
            </Panel>
          </section>

          <section>
            <h2 className="mb-2 flex items-center gap-2 font-medium">
              <Palette className="size-4 text-muted" />
              Branding
            </h2>
            <Panel className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-muted">Logo and colours are detected from your website and used in the widget and messages.</span>
              <AiPill>Phase 2</AiPill>
            </Panel>
          </section>

          <section>
            <h2 className="mb-1 flex items-center gap-2 font-medium">
              <Sparkles className="size-4 text-ai" />
              Agent autonomy
            </h2>
            <p className="mb-2 text-muted">Choose what the planner may do on its own. Anything set to “Ask me first” lands in your inbox.</p>
            <Panel className="divide-y divide-line">
              {capabilities.map(([label, level]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span>{label}</span>
                  <Pill className={level === "act" ? "border-ai-line bg-ai-soft text-ai" : undefined}>{autonomyLabel[level]}</Pill>
                </div>
              ))}
            </Panel>
          </section>

          <section>
            <h2 className="mb-2 flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4 text-muted" />
              Privacy
            </h2>
            <Panel className="px-4 py-3 text-muted">
              All agency and client data is stored in the EU. Every action by people and AI agents is recorded in the activity log.
            </Panel>
          </section>
        </div>
      </div>
    </>
  );
}
