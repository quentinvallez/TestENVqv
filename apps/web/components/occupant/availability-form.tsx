"use client";

import { startTransition, useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { occupantText } from "@/lib/occupant-i18n";
import type { WidgetLang } from "@/lib/widget-i18n";
import type { OccupantFormState } from "@/app/(public)/occupant-actions";

const order = [1, 2, 3, 4, 5, 6, 0];
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const field = "h-10 rounded-md border border-line bg-panel px-2 tabular-nums outline-none focus:border-line-strong";

/** Weekly visiting times, days away and notice, on the owner's or tenant's own page. Works with taps only. */
export function OccupantAvailabilityForm({
  lang,
  windows,
  away,
  noticeHours,
  action,
}: {
  lang: WidgetLang;
  windows: { weekday: number; startMinute: number; endMinute: number }[];
  away: { from: string; to: string }[];
  noticeHours: number | null;
  action: (state: OccupantFormState, form: FormData) => Promise<OccupantFormState>;
}) {
  const t = occupantText[lang];
  const [state, formAction, pending] = useActionState(action, undefined);
  const [periods, setPeriods] = useState(away.length ? away : []);

  return (
    <form
      // Submitted by hand so React does not reset the fields to their initial values after saving.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="flex flex-col gap-5"
    >
      <div className="divide-y divide-line rounded-lg border border-line">
        {order.map((weekday) => {
          const w = windows.find((x) => x.weekday === weekday);
          return (
            <label key={weekday} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <input type="checkbox" name={`on-${weekday}`} defaultChecked={Boolean(w)} className="peer size-4" />
              <span className="w-24 capitalize">{t.days[weekday]}</span>
              <span className="flex items-center gap-2 text-muted peer-not-checked:opacity-40">
                <input type="time" name={`start-${weekday}`} defaultValue={hhmm(w?.startMinute ?? (weekday === 6 ? 600 : 1020))} step={900} className={field} />
                –
                <input type="time" name={`end-${weekday}`} defaultValue={hhmm(w?.endMinute ?? (weekday === 6 ? 780 : 1200))} step={900} className={field} />
              </span>
            </label>
          );
        })}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-medium">{t.notice}</span>
        <select name="notice" defaultValue={noticeHours ?? 0} className={field}>
          {Object.entries(t.noticeOptions).map(([hours, label]) => (
            <option key={hours} value={hours}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <div>
          <div className="font-medium">{t.away}</div>
          <p className="text-[12px] text-muted">{t.awayHint}</p>
        </div>
        {periods.map((p, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[12px] text-muted">
              {t.from}
              <input type="date" name="away-from" defaultValue={p.from} required className={field} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-muted">
              {t.to}
              <input type="date" name="away-to" defaultValue={p.to} required className={field} />
            </label>
            <button type="button" onClick={() => setPeriods((all) => all.filter((_, j) => j !== i))} className="flex h-10 items-center gap-1 rounded-md border border-line px-3 text-muted hover:bg-hover">
              <X className="size-3.5" />
              {t.remove}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setPeriods((all) => [...all, { from: "", to: "" }])}
          className="flex h-10 w-fit items-center gap-1.5 rounded-md border border-line px-3 hover:bg-hover"
        >
          <Plus className="size-3.5" />
          {t.addAway}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <button disabled={pending} className="h-10 rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] hover:opacity-90 disabled:opacity-50">
          {pending ? t.saving : t.save}
        </button>
        {state?.saved && <p className="text-success">{t.saved}</p>}
        {state?.saved && !!state.conflicts && <p className="text-muted">{t.conflicts(state.conflicts)}</p>}
        {state?.error && <p className="text-danger">{t.error}</p>}
      </div>
    </form>
  );
}
