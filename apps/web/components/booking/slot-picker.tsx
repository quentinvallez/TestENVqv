"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { SlotDay } from "@/lib/slots";

/** Day strip plus time grid. The chosen slot is submitted as `startsAt`. */
export function SlotPicker({ days, onChange }: { days: SlotDay[]; onChange?: (value: string | null) => void }) {
  const [dayKey, setDayKey] = useState(days[0]?.key);
  const [value, setValue] = useState<string | null>(null);
  const day = days.find((d) => d.key === dayKey) ?? days[0];

  if (!day) return <p className="rounded-lg border border-line px-4 py-6 text-center text-muted">No free times in the coming weeks. Please contact the agency.</p>;

  const choose = (next: string | null) => {
    setValue(next);
    onChange?.(next);
  };

  return (
    <div>
      <input type="hidden" name="startsAt" value={value ?? ""} />
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((d) => (
          <button
            type="button"
            key={d.key}
            onClick={() => {
              setDayKey(d.key);
              choose(null);
            }}
            className={cn(
              "flex w-[60px] shrink-0 flex-col items-center rounded-lg border py-2 transition-colors",
              d.key === day.key ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]" : "border-line hover:border-line-strong",
            )}
          >
            <span className={cn("text-[11px]", d.key === day.key ? "opacity-80" : "text-muted")}>{d.weekday}</span>
            <span className="font-medium">{d.date}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {day.slots.map((slot) => (
          <button
            type="button"
            key={slot.value}
            onClick={() => choose(slot.value)}
            className={cn(
              "h-10 rounded-md border font-medium tabular-nums transition-colors",
              slot.value === value ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]" : "border-line hover:border-line-strong",
            )}
          >
            {slot.label}
          </button>
        ))}
      </div>
    </div>
  );
}
