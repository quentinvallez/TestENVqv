"use client";

import { useActionState, useState } from "react";
import { CalendarClock, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { DraftState } from "./actions";

/** Drafts the automatic jobs prepare, by proposal kind. */
const draftKindLabel: Record<string, string> = {
  reminder: "Reminder",
  follow_up: "Follow-up after the viewing",
  no_show: "After a no-show",
  nudge: "Check-in, no answer yet",
};

export function DraftComposer({
  initialBody,
  slots,
  generatedBy,
  kind,
  channelLabel,
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
  send: (state: DraftState, form: FormData) => Promise<DraftState>;
  dismiss: () => Promise<void>;
  redraft: () => Promise<void>;
  aiEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(send, undefined);
  const [body, setBody] = useState(initialBody);

  return (
    <form action={formAction} className="rounded-lg border border-ai-line bg-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-ai-line bg-ai-soft px-3 py-2 text-ai">
        <Sparkles className="size-3.5" />
        <span className="font-medium">{(kind && draftKindLabel[kind]) ?? "Planner draft"}</span>
        <span className="text-[12px] opacity-80">
          {kind === "reminder" ? "fixed template, never written by AI" : generatedBy === "ai" ? "written by AI" : "from a template (AI not configured)"}
        </span>
      </div>
      {slots.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
          <CalendarClock className="size-3.5 text-muted" />
          <span className="mr-1 text-[12px] text-muted">Proposed times, free in the agent&apos;s calendar:</span>
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
          {pending ? "Sending…" : `Send via ${channelLabel}`}
        </Button>
        {aiEnabled && kind !== "reminder" && (
          <Button type="button" size="sm" variant="ai" onClick={() => redraft()} className="h-10 sm:h-7">
            <RefreshCw className="size-3.5" />
            Rewrite with AI
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => dismiss()} className="h-10 sm:h-7">
          <X className="size-3.5" />
          Dismiss
        </Button>
        <span className="w-full text-[11px] text-faint sm:ml-auto sm:w-auto">Saved to the conversation; delivery starts when {channelLabel} is connected.</span>
      </div>
    </form>
  );
}

export function ReplyBox({ send, channelLabel }: { send: (state: DraftState, form: FormData) => Promise<DraftState>; channelLabel: string }) {
  const [state, formAction, pending] = useActionState(send, undefined);
  return (
    <form action={formAction} className="rounded-lg border border-line bg-panel">
      <textarea name="body" rows={3} placeholder={`Reply via ${channelLabel}…`} className="block w-full resize-y bg-transparent px-3 py-2.5 outline-none placeholder:text-faint" />
      {state?.error && <p className="px-3 pb-2 text-danger">{state.error}</p>}
      <div className="flex justify-end border-t border-line px-3 py-2">
        <Button size="sm" disabled={pending}>
          <Send className="size-3.5" />
          Send
        </Button>
      </div>
    </form>
  );
}
