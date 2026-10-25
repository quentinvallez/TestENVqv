import { REMINDER_HOUR, runTool, tools } from "@viewing/core";
import { db, eq, schema } from "@viewing/db";
import { BellRing, Palette, Play, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { ChannelMark } from "@/components/channel";
import { AiPill, Button, PageHeader, Panel, Pill, StatusDot } from "@/components/ui";
import { getSession, getToolContext } from "@/lib/context";
import { formatRelative } from "@/lib/format";
import { automationRuleLabel } from "@/lib/labels";
import { connectWhatsAppAction, disconnectWhatsAppAction, runAutomationsAction, setNudgeDaysAction, updateAutomationsAction } from "../actions";
import { CopyText, WhatsAppForm } from "./channels";

const capabilities = [
  ["Reply to new portal leads with a booking link", "act"],
  ["Handle cancellations and reschedules from replies", "suggest"],
  ["Reassign a lead to another agent", "suggest"],
] as const;

const autonomyLabel = { suggest: "Ask me first", act_and_notify: "Do it and tell me", act: "Do it" };

export default async function SettingsPage() {
  const { agency } = await getSession();
  const ctx = await getToolContext();
  const settings = await db.query.agencySettings.findFirst({ where: eq(schema.agencySettings.agencyId, agency.id) });
  const [channels, automations, runs] = await Promise.all([
    runTool(tools.channelsStatus, ctx, {}),
    runTool(tools.getAutomationSettings, ctx, {}),
    runTool(tools.listAutomationRuns, ctx, { limit: 8 }),
  ]);
  const sendingMailboxes = channels.mailboxes.filter((m) => m.sends);
  const jobs = [
    {
      key: "reminders",
      on: automations.reminders,
      title: "Reminder the day before",
      description: `From ${REMINDER_HOUR}:00 the evening before each viewing and valuation visit, with time, address, agent and the link to move or cancel. Fixed text in the client's language, never written by AI.`,
    },
    {
      key: "followUps",
      on: automations.followUps,
      title: "Follow-up after the viewing",
      description: "An hour after a viewing the planner marks it done. The next day it drafts a personal follow-up, unless you already wrote to the client.",
    },
    {
      key: "noShows",
      on: automations.noShows,
      title: "Message after a no-show",
      description: "When you mark that a client didn't come (Appointments), the planner drafts a friendly message with new times.",
    },
    {
      key: "nudges",
      on: automations.nudges,
      title: "Check in with quiet leads",
      description: `When a lead hasn't answered your last message for ${automations.nudgeAfterDays} days, the planner drafts a short check-in. At most two, and never once they booked.`,
    },
  ] as const;

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
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-medium">
                <BellRing className="size-4 text-muted" />
                Automations
              </h2>
              <form action={runAutomationsAction}>
                <Button size="sm" type="submit">
                  <Play className="size-3.5" />
                  Run now
                </Button>
              </form>
            </div>
            <p className="mb-2 text-muted">These jobs run on their own every day. Except reminders you allow below, everything they write waits in the inbox for your approval.</p>
            <Panel className="divide-y divide-line">
              {jobs.map((job) => (
                <div key={job.key} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {job.title}
                      <StatusDot color={job.on ? "var(--success)" : "var(--line-strong)"} />
                      <span className="text-[12px] font-normal text-muted">{job.on ? "On" : "Off"}</span>
                    </div>
                    <p className="mt-0.5 max-w-xl text-muted">{job.description}</p>
                    {job.key === "reminders" && job.on && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-muted">Sending:</span>
                        <Pill className={automations.sendRemindersAutomatically ? "border-ai-line bg-ai-soft text-ai" : undefined}>
                          {automations.sendRemindersAutomatically ? "Automatically" : "After your approval"}
                        </Pill>
                        <form action={updateAutomationsAction.bind(null, { sendRemindersAutomatically: !automations.sendRemindersAutomatically })}>
                          <button type="submit" className="text-[12px] text-muted underline underline-offset-2 hover:text-fg">
                            {automations.sendRemindersAutomatically ? "Ask me first instead" : "Send reminders automatically"}
                          </button>
                        </form>
                      </div>
                    )}
                    {job.key === "nudges" && job.on && (
                      <form action={setNudgeDaysAction} className="mt-2 flex items-center gap-2">
                        <label htmlFor="nudgeAfterDays" className="text-muted">
                          Days without an answer
                        </label>
                        <select
                          id="nudgeAfterDays"
                          name="nudgeAfterDays"
                          defaultValue={automations.nudgeAfterDays}
                          className="h-8 rounded-md border border-line bg-panel px-2"
                        >
                          {[2, 3, 4, 5, 7, 10, 14].map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" type="submit">
                          Save
                        </Button>
                      </form>
                    )}
                  </div>
                  <form action={updateAutomationsAction.bind(null, { [job.key]: !job.on })} className="shrink-0">
                    <Button type="submit">{job.on ? "Turn off" : "Turn on"}</Button>
                  </form>
                </div>
              ))}
            </Panel>
            {runs.length > 0 && (
              <Panel className="mt-3 divide-y divide-line">
                <div className="px-4 py-2 text-[12px] font-medium text-muted">Recently</div>
                {runs.map((run) => (
                  <div key={run.id} className="flex items-center gap-3 px-4 py-2">
                    <StatusDot color={run.outcome === "failed" ? "var(--danger)" : run.outcome === "sent" ? "var(--success)" : "var(--ai)"} />
                    <span className="flex-1 truncate">
                      {automationRuleLabel[run.rule] ?? run.rule}{" "}
                      <span className="text-muted">
                        {run.outcome === "drafted" ? "drafted for approval" : run.outcome === "sent" ? (run.detail.delivery === "simulated" ? "stored, channel not connected" : "sent") : run.outcome}
                      </span>
                    </span>
                    <span className="text-[12px] text-faint tabular-nums">{formatRelative(run.createdAt)}</span>
                  </div>
                ))}
              </Panel>
            )}
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
