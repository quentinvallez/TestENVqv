"use client";

import { useActionState, useState } from "react";
import { CalendarClock, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { DraftState } from "./actions";
import { msg } from "@/lib/i18n";

/** Drafts the automatic jobs prepare, by proposal kind. */
const draftKindLabel: Record<string, string> = {
  reminder: msg("Reminder"),
  follow_up: msg("Follow-up after the viewing"),
  no_show: msg("After a no-show"),
  nudge: msg("Check-in, no answer yet"),
  off_market: msg("Viewing off: the listing is no longer on offer"),
  occupant_conflict: msg("The occupants can't receive this viewing"),
  occupant_invite: msg("Invitation to give visiting times"),
  occupant_booked: msg("Alert to the owner: viewing booked"),
  occupant_rescheduled: msg("Alert to the owner: viewing moved"),
  occupant_cancelled: msg("Alert to the owner: viewing cancelled"),
  occupant_digest: msg("Alert to the owner: tomorrow's viewings"),
  occupant_nudge: msg("Reminder to give visiting times"),
};

export function DraftComposer({
  initialBody,
  slots,
  generatedBy,
  kind,
  channelLabel,
  ready,
  send,
  dismiss,
  redraft,
  aiEnabled,
}: {
  initialBody: string;
  slots: string[];
  generatedBy: "ai" | "template" | null;
  kind?: string | null;
  channelLabel: string;
  /** Whether the channel is connected, so sending really delivers. */
  ready: boolean;
  send: (state: DraftState, form: FormData) => Promise<DraftState>;
  dismiss: () => Promise<void>;
  redraft: () => Promise<void>;
  aiEnabled: boolean;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(send, undefined);
  const [body, setBody] = useState(initialBody);

  return (
    <form action={formAction} className="rounded-lg border border-ai-line bg-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-ai-line bg-ai-soft px-3 py-2 text-ai">
        <Sparkles className="size-3.5" />
        <span className="font-medium">{kind && draftKindLabel[kind] ? t(draftKindLabel[kind]) : t("Planner draft")}</span>
        <span className="text-[12px] opacity-80">
          {kind === "reminder" ? t("fixed template, never written by AI") : generatedBy === "ai" ? t("written by AI") : t("from a template (AI not configured)")}
        </span>
      </div>
      {slots.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
          <CalendarClock className="size-3.5 text-muted" />
          <span className="mr-1 text-[12px] text-muted">{t("Proposed times, free in the agent's calendar:")}</span>
          {slots.map((slot) => (
            <span key={slot} className="rounded border border-ai-line bg-ai-soft px-1.5 py-0.5 text-[12px] font-medium text-ai tabular-nums">
              {slot}
            </span>
          ))}
        </div>
      )}
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={Math.min(14, body.split("\n").length + 1)}
        style={{ maxHeight: "40dvh" }}
        className="block w-full resize-y bg-transparent px-3 py-2.5 leading-5 outline-none"
      />
      {state?.error && <p className="px-3 pb-2 text-danger">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <Button variant="primary" disabled={pending} className="h-10 flex-1 sm:h-7 sm:flex-none sm:px-2.5 sm:text-[12px]">
          <Send className="size-3.5" />
          {pending ? t("Sending…") : t("Send via {channel}", { channel: channelLabel })}
        </Button>
        {aiEnabled && kind !== "reminder" && (
          <Button type="button" size="sm" variant="ai" onClick={() => redraft()} className="h-10 sm:h-7">
            <RefreshCw className="size-3.5" />
            {t("Rewrite with AI")}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => dismiss()} className="h-10 sm:h-7">
          <X className="size-3.5" />
          {t("Dismiss")}
        </Button>
        <span className="w-full text-[11px] text-faint sm:ml-auto sm:w-auto">{ready ? t("Delivered to the client as soon as you send.") : t("Saved to the conversation, not delivered: {channel} isn't connected yet.", { channel: channelLabel })}</span>
      </div>
    </form>
  );
}
