"use client";

import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui";
import type { AvailabilityState } from "../../actions";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n";

const days = [
  [1, msg("Monday")],
  [2, msg("Tuesday")],
  [3, msg("Wednesday")],
  [4, msg("Thursday")],
  [5, msg("Friday")],
  [6, msg("Saturday")],
  [0, msg("Sunday")],
] as const;

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const field = "h-8 rounded-md border border-line bg-panel px-2 tabular-nums outline-none focus:border-line-strong";

export function AvailabilityForm({
  workingHours,
  slotMinutes,
  bufferMinutes,
  action,
}: {
  workingHours: { weekday: number; startMinute: number; endMinute: number }[];
  slotMinutes: number;
  bufferMinutes: number;
  action: (state: AvailabilityState, form: FormData) => Promise<AvailabilityState>;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, undefined);

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
        {days.map(([weekday, label]) => {
          const window = workingHours.find((w) => w.weekday === weekday);
          return (
            <label key={weekday} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <input type="checkbox" name={`on-${weekday}`} defaultChecked={Boolean(window)} className="peer" />
              <span className="w-24">{t(label)}</span>
              <span className="flex items-center gap-2 text-muted peer-not-checked:opacity-40">
                <input type="time" name={`start-${weekday}`} defaultValue={hhmm(window?.startMinute ?? 540)} step={900} className={field} />
                –
                <input type="time" name={`end-${weekday}`} defaultValue={hhmm(window?.endMinute ?? 1080)} step={900} className={field} />
              </span>
            </label>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">{t("Viewing length")}</span>
          <select name="slotMinutes" defaultValue={slotMinutes} className={field}>
            {[15, 20, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {t("{n} minutes", { n: m })}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">{t("Travel buffer between viewings")}</span>
          <select name="bufferMinutes" defaultValue={bufferMinutes} className={field}>
            {[0, 10, 15, 20, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? t("None") : t("{n} minutes", { n: m })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending}>
          {pending ? t("Saving…") : t("Save availability")}
        </Button>
        {state?.saved && <span className="text-success">{t("Saved")}</span>}
        {state?.error && <span className="text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
