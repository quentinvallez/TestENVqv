import { REMINDER_HOUR, runTool, tools } from "@viewing/core";
import { db, eq, schema } from "@viewing/db";
import { BellRing, Lock, Palette, Play, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { ChannelMark } from "@/components/channel";
import { SettingsTabs } from "@/components/settings-tabs";
import { Button, PageHeader, Panel, Pill, StatusDot } from "@/components/ui";
import { getSession, getToolContext } from "@/lib/context";
import { formatRelative } from "@/lib/format";
import { automationRuleLabel } from "@/lib/labels";
import {
  checkWhatsAppAction,
  connectWhatsAppAction,
  disconnectWhatsAppAction,
  runAutomationsAction,
  setBrandColourAction,
  setNudgeDaysAction,
  setRetentionAction,
  updateAutomationsAction,
} from "../actions";
import { BrandColour } from "../widget/brand-colour";
import { CopyText, WhatsAppCheckForm, WhatsAppForm } from "./channels";
import { PortalLeads } from "./portal-leads";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n";

const capabilities = [[msg("Reassign a lead to another agent"), "suggest"]] as const;

/** Which "send automatically" setting belongs to which job. */
const sendingFlag: Record<string, "sendRemindersAutomatically" | "sendFollowUpsAutomatically" | "sendNoShowsAutomatically" | "sendNudgesAutomatically"> = {
  reminders: "sendRemindersAutomatically",
  followUps: "sendFollowUpsAutomatically",
  noShows: "sendNoShowsAutomatically",
  nudges: "sendNudgesAutomatically",
};
const autonomyLabel = { suggest: msg("Ask me first"), act_and_notify: msg("Do it and tell me"), act: msg("Do it") };

export default async function SettingsPage() {
  const t = await getT();
  const { agency, isAdmin } = await getSession();
  if (!isAdmin) {
    return (
      <>
        <PageHeader crumbs={[{ label: t("Settings") }]} />
        <SettingsTabs active="general" />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[760px] px-5 py-6">
            <Panel className="px-4 py-3 text-muted">{t("Only the agency's admins can change settings. Ask an admin if something should be different.")}</Panel>
          </div>
        </div>
      </>
    );
  }
  const ctx = await getToolContext();
  const settings = await db.query.agencySettings.findFirst({ where: eq(schema.agencySettings.agencyId, agency.id) });
  const [channels, automations, runs, retention, widget] = await Promise.all([
    runTool(tools.channelsStatus, ctx, {}),
    runTool(tools.getAutomationSettings, ctx, {}),
    runTool(tools.listAutomationRuns, ctx, { limit: 8 }),
    runTool(tools.previewRetention, ctx, {}),
    runTool(tools.getWidgetSettings, ctx, {}),
  ]);
  const { privacyUrl } = retention;
  const sendingMailboxes = channels.mailboxes.filter((m) => m.sends);
  const jobs = [
    {
      key: "reminders",
      on: automations.reminders,
      title: t("Reminder the day before"),
      description: t("From {hour}:00 the evening before each viewing and valuation visit, with time, address, agent and the link to move or cancel. Fixed text in the client's language, never written by AI.", { hour: REMINDER_HOUR }),
    },
    {
      key: "followUps",
      on: automations.followUps,
      title: t("Follow-up after the viewing"),
      description: t("An hour after a viewing the planner marks it done. The next day the client gets a follow-up asking how they liked it, unless you already wrote to them. Mark no-shows the same day so they don't get it."),
    },
    {
      key: "noShows",
      on: automations.noShows,
      title: t("Message after a no-show"),
      description: t("When you mark that a client didn't come (Calendar → List), the client gets a friendly message with new times to book."),
    },
    {
      key: "nudges",
      on: automations.nudges,
      title: t("Check in with quiet leads"),
      description: t("When a lead hasn't answered your last message for {n} days, they get a short check-in. At most two, and never once they booked.", { n: automations.nudgeAfterDays }),
    },
    {
      key: "whatsappInvite",
      on: automations.whatsappInvite,
      title: t("Invite clients to WhatsApp"),
      description: t(
        "Emails to clients who aren't on WhatsApp with you yet end with a link that opens WhatsApp with a short message to you. WhatsApp only allows you to write once the client has written first; after that, reminders and follow-ups go by WhatsApp. Needs a WhatsApp number (Settings → Channels).",
      ),
    },
    {
      key: "repliesToAgent",
      on: automations.repliesToAgent,
      title: t("Client replies go to the agent's mailbox"),
      description: t(
        "When a client answers an email, the reply lands in the agent's own Outlook or Gmail, and the agent answers from there. The app keeps a silent copy, only so reminders and check-ins stop for clients who already answered. Turn off to answer replies in the app instead, with a drafted reply under Viewing requests → Needs you.",
      ),
    },
    {
      key: "agentAlerts",
      on: automations.agentAlerts,
      title: t("Email the agent about bookings"),
      description: t("When a client books, moves or cancels a viewing or valuation visit on the website or through their link, the agent gets an email at their own address. No mailbox needs to be connected."),
    },
  ] as const;

  return (
    <>
      <PageHeader crumbs={[{ label: t("Settings") }]} />
      <SettingsTabs active="general" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-5 py-6">
          <section>
            <h2 className="mb-2 font-medium">{t("Agency")}</h2>
            <Panel className="divide-y divide-line">
              {[
                [t("Name"), agency.name],
                [t("Website"), settings?.websiteUrl ?? t("Not set")],
                [t("Default language"), (settings?.defaultLanguage ?? "nl").toUpperCase()],
                [t("Time zone"), settings?.timezone ?? "Europe/Brussels"],
                [t("Data location"), t("EU · Frankfurt")],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-muted">{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </Panel>
          </section>

          <section id="channels" className="scroll-mt-4">
            <h2 className="mb-1 flex items-center gap-2 font-medium">
              <Radio className="size-4 text-muted" />
              {t("Channels")}
            </h2>
            <p className="mb-2 text-muted">{t("How messages to clients go out, and how replies and portal leads come in. When WhatsApp or an agent's mailbox doesn't work, messages go by email from the agency address instead.")}</p>
            <Panel className="divide-y divide-line">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{t("Inbox address")}</span>
                  {channels.inboundAddress && <CopyText text={channels.inboundAddress} />}
                </div>
                {channels.inboundAddress ? (
                  <>
                    <p className="mt-1 font-mono text-[12px] break-all">{channels.inboundAddress}</p>
                    <p className="mt-1 text-[12px] text-muted">
                      {t("Client email replies go to the agent's own mailbox, with a copy here (see Automations to change that). Immoweb, Zimmo, Immovlan and Immoscoop leads and your website's contact-form mails sent here become viewing requests for the listing's agent; see Portal leads below.")}
                      {channels.portalLeads > 0 && ` ${t("{n} portal leads so far.", { n: channels.portalLeads })}`}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 flex items-center gap-1.5 text-muted">
                    <StatusDot color="var(--line-strong)" />
                    {t("Not active yet: the platform's mail domain isn't configured.")}
                  </p>
                )}
              </div>
              <div className="flex items-start gap-3 px-4 py-3">
                <ChannelMark provider="email" size={18} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t("Email")}</div>
                  <p className="text-[12px] text-muted">
                    {sendingMailboxes.length > 0
                      ? `${sendingMailboxes.length === 1 ? t("1 agent sends from their own mailbox ({names}).", { names: sendingMailboxes.map((m) => m.agentName).join(", ") }) : t("{n} agents send from their own mailbox ({names}).", { n: sendingMailboxes.length, names: sendingMailboxes.map((m) => m.agentName).join(", ") })} `
                      : `${t("Agents can connect Google or Outlook on their page to send from their own mailbox.")} `}
                    {channels.email.agencySending ? t("Others send from the inbox address.") : t("Without a mailbox, email stays a draft that isn't delivered.")}
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
                      ? t("Your business number {number}.", { number: channels.whatsapp.number ?? "" })
                      : channels.whatsapp.status === "platform"
                        ? t("Using the shared pilot number {number}. Connect your own number so clients see your agency's name.", { number: channels.whatsapp.number ?? "" })
                        : t("Not connected: WhatsApp replies stay drafts that aren't delivered.")}
                  </p>
                  {channels.whatsapp.status === "own" ? (
                    <form action={disconnectWhatsAppAction}>
                      <button className="text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline">{t("Disconnect")}</button>
                    </form>
                  ) : channels.canStoreTokens ? (
                    <WhatsAppForm action={connectWhatsAppAction} />
                  ) : null}
                  {isAdmin && <WhatsAppCheckForm action={checkWhatsAppAction} />}
                </div>
                <StatusDot color={channels.whatsapp.status === "none" ? "var(--line-strong)" : "var(--success)"} className="mt-1.5" />
              </div>
            </Panel>
          </section>

          <PortalLeads ctx={ctx} copies={automations.portalLeadCopies} />

          <section id="colour" className="scroll-mt-4">
            <h2 className="mb-1 flex items-center gap-2 font-medium">
              <Palette className="size-4 text-muted" />
              {t("Your colour")}
            </h2>
            <p className="mb-2 max-w-xl text-muted">
              {t("Used for the floating buttons and the booking and valuation widgets on your website, and on your booking pages. We take it from your website; pick your own if it's wrong or you want another one.")}
            </p>
            <Panel className="p-4">
              <BrandColour
                current={widget.brandColor}
                detected={widget.detectedColor}
                chosen={widget.colourChosen}
                canEdit={isAdmin}
                save={setBrandColourAction}
              />
            </Panel>
          </section>

          <section>
            <h2 className="mb-1 flex items-center gap-2 font-medium">
              <Sparkles className="size-4 text-ai" />
              {t("Agent autonomy")}
            </h2>
            <p className="mb-2 text-muted">{t("Choose what the planner may do on its own. Anything set to “Ask me first” waits under Viewing requests → Needs you.")}</p>
            <Panel className="divide-y divide-line">
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{t("Reply to portal and website requests that ask to visit")}</span>
                    <Pill className={automations.replyToPortalLeadsAutomatically ? "border-ai-line bg-ai-soft text-ai" : undefined}>
                      {t(automations.replyToPortalLeadsAutomatically ? autonomyLabel.act : autonomyLabel.suggest)}
                    </Pill>
                  </div>
                  <p className="mt-0.5 max-w-xl text-muted">
                    {t("When an Immoweb, Zimmo, Immovlan or Immoscoop lead, or your website's contact form, asks to visit an active listing, the planner replies right away with free times and the listing's booking link. Fixed text in the client's language; the AI only recognises the request. Listings under option or sold and plain questions show under Viewing requests → Needs you.")}
                  </p>
                </div>
                <form action={updateAutomationsAction.bind(null, { replyToPortalLeadsAutomatically: !automations.replyToPortalLeadsAutomatically })} className="shrink-0">
                  <Button type="submit">{automations.replyToPortalLeadsAutomatically ? t("Ask me first instead") : t("Reply automatically")}</Button>
                </form>
              </div>
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{t("Cancellations and changes of time")}</span>
                    <Pill className={automations.sendBookingConfirmationsAutomatically ? "border-ai-line bg-ai-soft text-ai" : undefined}>
                      {t(automations.sendBookingConfirmationsAutomatically ? autonomyLabel.act : autonomyLabel.suggest)}
                    </Pill>
                  </div>
                  <p className="mt-0.5 max-w-xl text-muted">
                    {t("Clients cancel or move their viewing themselves with the button in their confirmation, never by replying. The viewing is cancelled or moved in the agent's calendar straight away, the agent gets an email, and the client gets the confirmation of the new time, or other free times after a cancellation. Fixed text in the client's language. Replies to our emails go to the agent's own mailbox. The confirmation follows the booking confirmations setting under Automations.")}
                  </p>
                </div>
              </div>
              {capabilities.map(([label, level]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span>{t(label)}</span>
                  <Pill>{t(autonomyLabel[level])}</Pill>
                </div>
              ))}
            </Panel>
          </section>

          <section>
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-medium">
                <BellRing className="size-4 text-muted" />
                {t("Automations")}
              </h2>
              <form action={runAutomationsAction}>
                <Button size="sm" type="submit">
                  <Play className="size-3.5" />
                  {t("Run now")}
                </Button>
              </form>
            </div>
            <p className="mb-2 text-muted">{t("These jobs run on their own and send their messages automatically, in fixed text in the client's language. Set any of them to “Ask me first” to approve each message under Viewing requests → Needs you instead.")}</p>
            <Panel className="divide-y divide-line">
              {jobs.map((job) => (
                <div key={job.key} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {job.title}
                      <StatusDot color={job.on ? "var(--success)" : "var(--line-strong)"} />
                      <span className="text-[12px] font-normal text-muted">{job.on ? t("On") : t("Off")}</span>
                    </div>
                    <p className="mt-0.5 max-w-xl text-muted">{job.description}</p>
                    {job.on && job.key in sendingFlag && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-muted">{t("Sending:")}</span>
                        <Pill className={automations[sendingFlag[job.key]!] ? "border-ai-line bg-ai-soft text-ai" : undefined}>
                          {automations[sendingFlag[job.key]!] ? t("Automatically") : t("After your approval")}
                        </Pill>
                        <form action={updateAutomationsAction.bind(null, { [sendingFlag[job.key]!]: !automations[sendingFlag[job.key]!] })}>
                          <button type="submit" className="text-[12px] text-muted underline underline-offset-2 hover:text-fg">
                            {automations[sendingFlag[job.key]!] ? t("Ask me first instead") : t("Send automatically")}
                          </button>
                        </form>
                      </div>
                    )}
                    {job.key === "nudges" && job.on && (
                      <form action={setNudgeDaysAction} className="mt-2 flex items-center gap-2">
                        <label htmlFor="nudgeAfterDays" className="text-muted">
                          {t("Days without an answer")}
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
                          {t("Save")}
                        </Button>
                      </form>
                    )}
                  </div>
                  <form action={updateAutomationsAction.bind(null, { [job.key]: !job.on })} className="shrink-0">
                    <Button type="submit">{job.on ? t("Turn off") : t("Turn on")}</Button>
                  </form>
                </div>
              ))}
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("Confirmation after a booking or cancellation")}</div>
                  <p className="mt-0.5 max-w-xl text-muted">
                    {t("When a client books or moves a viewing or valuation visit themselves, they get a confirmation with time, place, agent and the link to change it. When they cancel, they get new times and the booking link in case they still want to come. Fixed text in their language, no AI.")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-muted">{t("Sending:")}</span>
                    <Pill>{automations.sendBookingConfirmationsAutomatically ? t("Automatically") : t("After your approval")}</Pill>
                  </div>
                </div>
                <form action={updateAutomationsAction.bind(null, { sendBookingConfirmationsAutomatically: !automations.sendBookingConfirmationsAutomatically })} className="shrink-0">
                  <Button type="submit">{automations.sendBookingConfirmationsAutomatically ? t("Ask me first instead") : t("Send automatically")}</Button>
                </form>
              </div>
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("Alerts to owners and tenants")}</div>
                  <p className="mt-0.5 max-w-xl text-muted">
                    {t("A message to the occupants of a home for each booked, moved or cancelled viewing, the evening before, and a reminder when they haven't given visiting times. Fixed texts, no AI.")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-muted">{t("Sending:")}</span>
                    <Pill>{automations.sendOccupantAlertsAutomatically ? t("Automatically") : t("After your approval")}</Pill>
                  </div>
                </div>
                <form action={updateAutomationsAction.bind(null, { sendOccupantAlertsAutomatically: !automations.sendOccupantAlertsAutomatically })} className="shrink-0">
                  <Button type="submit">{automations.sendOccupantAlertsAutomatically ? t("Ask me first instead") : t("Send automatically")}</Button>
                </form>
              </div>
            </Panel>
            {runs.length > 0 && (
              <Panel className="mt-3 divide-y divide-line">
                <div className="px-4 py-2 text-[12px] font-medium text-muted">{t("Recently")}</div>
                {runs.map((run) => (
                  <div key={run.id} className="flex items-center gap-3 px-4 py-2">
                    <StatusDot color={run.outcome === "failed" ? "var(--danger)" : run.outcome === "sent" ? "var(--success)" : "var(--ai)"} />
                    <span className="flex-1 truncate">
                      {automationRuleLabel[run.rule] ? t(automationRuleLabel[run.rule]!) : run.rule}{" "}
                      <span className="text-muted">
                        {run.outcome === "drafted" ? t("drafted for approval") : run.outcome === "sent" ? (run.detail.delivery === "simulated" ? t("stored, channel not connected") : t("sent")) : run.outcome}
                      </span>
                    </span>
                    <span className="text-[12px] text-faint tabular-nums">{t.relative(run.createdAt)}</span>
                  </div>
                ))}
              </Panel>
            )}
          </section>

          <section>
            <h2 className="mb-1 flex items-center gap-2 font-medium">
              <Lock className="size-4 text-muted" />
              {t("Client data (GDPR)")}
            </h2>
            <p className="mb-2 text-muted">{t("Your agency decides what happens with its clients' data; we process it for you on servers in the EU.")}</p>
            <Panel className="divide-y divide-line">
              <div className="px-4 py-3">
                <div className="font-medium">{t("Delete inactive clients")}</div>
                <p className="mt-0.5 max-w-xl text-muted">
                  {t("Clients nobody has been in touch with for this long are erased on their own: contact details, interests, messages and valuations. Owners and tenants of a listing and clients with an offer or a deal are kept. Valuation forms whose phone number was never confirmed go after 30 days.")}
                </p>
                <form action={setRetentionAction} className="mt-2 flex flex-wrap items-center gap-2">
                  <label htmlFor="retentionMonths" className="text-muted">
                    {t("After")}
                  </label>
                  <select id="retentionMonths" name="retentionMonths" defaultValue={retention.retentionMonths} className="h-8 rounded-md border border-line bg-panel px-2">
                    {[12, 24, 36, 60].map((m) => (
                      <option key={m} value={m}>
                        {t("{n} months without contact", { n: m })}
                      </option>
                    ))}
                    <option value={0}>{t("Never")}</option>
                  </select>
                  <Button size="sm" type="submit">
                    {t("Save")}
                  </Button>
                </form>
                {retention.retentionMonths > 0 && (
                  <p className="mt-2 text-[12px] text-muted">
                    {retention.due === 0 ? t("No client is due right now.") : retention.due === 1 ? t("1 client is due and will be erased at the next run.") : t("{n} clients are due and will be erased at the next run.", { n: retention.due })}
                  </p>
                )}
              </div>
              <div className="px-4 py-3">
                <div className="font-medium">{t("A client asks for their data, or to be forgotten")}</div>
                <p className="mt-0.5 max-w-xl text-muted">{t("Open the client under Contacts: “Download their data” gives a file to send them, and admins can erase the client for good.")}</p>
              </div>
              <div className="px-4 py-3">
                <div className="font-medium">{t("Privacy notice for your clients")}</div>
                <p className="mt-0.5 max-w-xl text-muted">
                  {t("The booking and valuation forms link to this page, in the client's language. Clients write to the agency owner's email address for requests. You can link to it from your own privacy policy too.")}
                </p>
                <div className="mt-2">
                  <span className="mr-2 break-all font-mono text-[12px]">{privacyUrl}</span>
                  <CopyText text={privacyUrl} />
                </div>
              </div>
            </Panel>
          </section>

          <section>
            <h2 className="mb-2 flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4 text-muted" />
              {t("Privacy")}
            </h2>
            <Panel className="px-4 py-3 text-muted">
              {t("All agency and client data is stored in the EU. Every action by people and AI agents is recorded in the activity log.")}
            </Panel>
          </section>
        </div>
      </div>
    </>
  );
}
