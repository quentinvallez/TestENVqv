import { CalendarCheck2, CalendarX2 } from "lucide-react";
import { whatsappProblem } from "@viewing/core";
import { ChannelMark, providerOf } from "@/components/channel";
import { leadOrigin, LeadSourcePill, type LeadOrigin } from "@/components/lead-source";
import { AiPill, StatusDot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { categoryMeta } from "@/lib/labels";

/*
 * What happened with a request, oldest first: the client's request, what we
 * sent (and whether it arrived), their answers and the booking notes. Read
 * only: clients' email replies are answered from the agent's own mailbox.
 */

/** A message sent without a human approving it: the fixed templates the agency lets go out on their own. */
const automaticLabel: Record<string, string> = {
  reminder: "Reminder · automatic",
  portal_reply: "Booking link · automatic",
  booking_confirmation: "Confirmation · automatic",
  follow_up: "Follow-up · automatic",
  no_show: "New times · automatic",
  cancellation_reply: "New times · automatic",
  nudge: "Check-in · automatic",
  occupant_booked: "Owner alert · automatic",
  occupant_rescheduled: "Owner alert · automatic",
  occupant_cancelled: "Owner alert · automatic",
  occupant_digest: "Owner alert · automatic",
};
const sentAutomatically = (m: { authorType: string | null; metadata: Record<string, unknown> }) =>
  m.authorType === "agent" && typeof m.metadata.kind === "string" ? (automaticLabel[m.metadata.kind] ?? null) : null;


/** The portal a lead email came through, stored on the message when it was taken in. */
const portalOf = (metadata: Record<string, unknown>): LeadOrigin | null => (typeof metadata.portal === "string" ? leadOrigin(metadata.portal) : null);

export type TimelineMessage = {
  id: string;
  direction: "inbound" | "outbound";
  authorType: string | null;
  subject: string | null;
  body: string;
  intent: string | null;
  delivery: string | null;
  metadata: Record<string, unknown>;
  sentAt: Date;
};
export type TimelineConversation = { id: string; channel: string; provider: string | null; messages: TimelineMessage[] };

export function Timeline({ conversations, name, agentName }: { conversations: TimelineConversation[]; name: string; agentName: string | null }) {
  const items = conversations
    .flatMap((c) => c.messages.map((m) => ({ m, c })))
    .sort((a, b) => a.m.sentAt.getTime() - b.m.sentAt.getTime());
  if (items.length === 0) return <p className="text-muted">Nothing sent or received yet.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {items.map(({ m, c }) => {
        const outbound = m.direction === "outbound";
        if (m.authorType === "system") {
          return (
            <li key={m.id} className="flex items-start gap-2 text-[12px] text-muted">
              {m.intent === "cancellation" ? <CalendarX2 className="mt-px size-3.5 shrink-0" /> : <CalendarCheck2 className="mt-px size-3.5 shrink-0" />}
              <span className="flex-1">
                <span className="font-medium text-fg">{name}</span> {m.body.charAt(0).toLowerCase() + m.body.slice(1)}
              </span>
              <span className="shrink-0 text-faint tabular-nums">{formatDateTime(m.sentAt)}</span>
            </li>
          );
        }
        const provider = providerOf(c.provider, c.channel);
        const portal = portalOf(m.metadata);
        return (
          <li key={m.id} className={cn("rounded-lg border border-line bg-panel", outbound && "sm:ml-8")}>
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2 text-[12px] text-muted">
              <ChannelMark provider={provider} size={13} />
              <span className="font-medium text-fg">{outbound ? (agentName ?? "Agency") : name}</span>
              {!outbound && portal && <LeadSourcePill origin={portal} prefix="via" className="shrink-0" />}
              {sentAutomatically(m) && <AiPill>{sentAutomatically(m)}</AiPill>}
              <span className="ml-auto shrink-0 tabular-nums">{formatDateTime(m.sentAt)}</span>
            </header>
            <div className="px-3 py-2.5 whitespace-pre-line break-words">{m.body}</div>
            {(m.intent || m.delivery) && (
              <footer className="flex flex-wrap items-center gap-2 px-3 pb-2.5">
                {!outbound && m.intent && categoryMeta[m.intent] && (
                  <span className="flex items-center gap-1.5 text-[11px] text-faint">
                    <StatusDot color={categoryMeta[m.intent]!.color} className="size-1.5" />
                    {categoryMeta[m.intent]!.label}
                  </span>
                )}
                <DeliveryNote delivery={m.delivery} metadata={m.metadata} channel={c.channel === "whatsapp" ? "whatsapp" : "email"} />
              </footer>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const transportLabel: Record<string, string> = { gmail: "Gmail", outlook: "Outlook", mailgun: "agency email", whatsapp_cloud: "WhatsApp" };
const failureLabel: Record<string, string> = {
  no_email: "no email address for this client",
  no_phone: "no phone number for this client",
  whatsapp_window_closed: "WhatsApp only allows templates 24 hours after the client's last message",
};

/** Why a message meant for WhatsApp went by email, in Meta's own words when we don't know the code. */
function fallbackNote(metadata: Record<string, unknown>) {
  if (metadata.fallbackReason === "whatsapp_window_closed") return " · WhatsApp needed a template";
  if (metadata.fallbackReason === "whatsapp_not_connected") return " · WhatsApp isn't connected";
  const detail = typeof metadata.whatsappError === "string" ? metadata.whatsappError : "";
  const why = whatsappProblem(detail) ?? (detail.length > 120 ? `${detail.slice(0, 120)}…` : detail);
  return why ? ` · WhatsApp didn't work: ${why}` : " · WhatsApp didn't work";
}

/** Whether an outbound message really left: sent, failed (with why) or only stored because the channel isn't connected. */
function DeliveryNote({ delivery, metadata, channel }: { delivery: string | null; metadata: Record<string, unknown>; channel: "email" | "whatsapp" }) {
  if (!delivery) return null;
  if (delivery === "simulated") {
    return <span className="text-[11px] text-faint">Not delivered: {channel === "email" ? "email" : "WhatsApp"} not connected yet</span>;
  }
  if (delivery === "failed") {
    const error = String(metadata.error ?? "");
    if (metadata.recoveredBy) {
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-faint" title={error}>
          <StatusDot color="var(--warning)" />
          WhatsApp couldn&apos;t deliver this{whatsappProblem(error) ? ` (${whatsappProblem(error)})` : ""}; sent by email instead
        </span>
      );
    }
    const why = metadata.bounced
      ? `the email bounced${error && error !== "bounced" ? ` (${error.length > 80 ? `${error.slice(0, 80)}…` : error})` : ""}`
      : (failureLabel[error] ?? whatsappProblem(error) ?? (error.length > 80 ? `${error.slice(0, 80)}…` : error || "the provider refused it"));
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-danger" title={error}>
        <StatusDot color="var(--danger)" />
        Not delivered: {why}
      </span>
    );
  }
  const status = typeof metadata.status === "string" && metadata.status !== "sent" ? ` · ${metadata.status}` : "";
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-faint">
      <StatusDot color="var(--success)" />
      Sent via {transportLabel[String(metadata.transport)] ?? channel}
      {metadata.template ? " template" : ""}
      {status}
      {metadata.fallbackFrom === "whatsapp" ? fallbackNote(metadata) : ""}
      {metadata.mailboxError ? " · the agent's mailbox refused it" : ""}
    </span>
  );
}
