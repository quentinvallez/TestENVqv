"use client";

import { useActionState, useState } from "react";
import { occupantText } from "@/lib/occupant-i18n";
import type { WidgetLang } from "@/lib/widget-i18n";
import type { ProblemState } from "@/app/(public)/occupant-actions";

/** "I can't make this time" under a planned viewing: opens a short note for the agent. */
export function ProblemForm({ lang, action }: { lang: WidgetLang; action: (state: ProblemState, form: FormData) => Promise<ProblemState> }) {
  const t = occupantText[lang];
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (state?.sent) return <p className="mt-1 text-[12px] text-success">{t.problemSent}</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-[12px] font-medium text-muted underline underline-offset-2 hover:text-fg">
        {t.problem}
      </button>
    );
  }
  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2">
      <p className="text-[12px] text-muted">{t.problemHint}</p>
      <textarea name="note" rows={2} maxLength={500} placeholder={t.problemNote} className="rounded-md border border-line bg-panel px-2 py-1.5 outline-none focus:border-line-strong" />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-md border border-line px-3 hover:bg-hover">
          {t.cancel}
        </button>
        <button disabled={pending} className="h-9 flex-1 rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] hover:opacity-90 disabled:opacity-50">
          {t.problemSend}
        </button>
      </div>
      {state?.error && <p className="text-[12px] text-danger">{t.error}</p>}
    </form>
  );
}
