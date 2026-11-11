import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Panel, StatusDot } from "@/components/ui";
import { formatRelative } from "@/lib/format";

type Undelivered = {
  failed: { messageId: string; conversationId: string; sentAt: Date; channel: string; client: string | null; kind: string; reason: string }[];
  more: boolean;
  simulated: number;
};

const kindLabel: Record<string, string> = {
  reply: "Reply",
  reminder: "Reminder",
  follow_up: "Follow-up",
  no_show: "New times after a no-show",
  nudge: "Check-in",
  portal_reply: "Portal reply",
  booking_confirmation: "Booking confirmation",
  booked: "Booking confirmation",
  rescheduled: "Confirmation of a move",
  recommendation: "Listing suggestion",
  off_market: "Listing no longer available",
};

/**
 * Client messages that didn't arrive (bounced, refused, no address) and weren't
 * sent another way. Messages go out on their own, so the office must see the
 * ones that failed without opening every conversation.
 */
export function UndeliveredMessages({ failed, more, simulated }: Undelivered) {
  if (failed.length === 0 && simulated === 0) return null;
  if (failed.length === 0) {
    return (
      <Link href="/settings#channels" className="mt-3 block">
        <Panel className="flex items-center gap-3 px-4 py-3 text-muted transition hover:bg-hover/60">
          <StatusDot color="var(--warning)" />
          <span className="flex-1">
            {simulated} {simulated === 1 ? "message was" : "messages were"} only saved in the last 14 days, because no email or WhatsApp is connected. Clients didn&apos;t get {simulated === 1 ? "it" : "them"}.
          </span>
          <ArrowUpRight className="size-4 shrink-0" />
        </Panel>
      </Link>
    );
  }
  return (
    <Panel className="mt-3">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <StatusDot color="var(--danger)" />
        <h2 className="flex-1 font-medium">
          {failed.length}
          {more ? "+" : ""} {failed.length === 1 && !more ? "message" : "messages"} didn&apos;t reach the client
        </h2>
        <span className="hidden text-[12px] text-muted sm:inline">Last 14 days</span>
      </div>
      <div className="divide-y divide-line">
        {failed.map((m) => (
          <Link key={m.messageId} href={`/inbox?c=${m.conversationId}`} className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-hover/60">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{m.client ?? "Unknown client"}</span>
                <span className="text-[12px] text-muted">
                  {kindLabel[m.kind] ?? "Message"} by {m.channel === "whatsapp" ? "WhatsApp" : "email"} · {formatRelative(m.sentAt)}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[12px] text-danger sm:truncate">{m.reason}</p>
            </div>
            <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted" />
          </Link>
        ))}
      </div>
      {simulated > 0 && (
        <p className="border-t border-line px-4 py-2 text-[12px] text-muted">
          Also {simulated} {simulated === 1 ? "message was" : "messages were"} only saved, because no channel is connected.
        </p>
      )}
    </Panel>
  );
}
