"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import type { VisitState } from "@/app/(public)/valuation-actions";
import type { SlotDay } from "@/lib/slots";
import { SlotPicker } from "../booking/slot-picker";

export function VisitBooker({ days, label, bookedText, action }: { days: SlotDay[]; label: string; bookedText: string; action: (state: VisitState, form: FormData) => Promise<VisitState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [chosen, setChosen] = useState<string | null>(null);
  if (state?.booked) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-hover px-3 py-2.5 font-medium">
        <Check className="size-4" />
        {bookedText.replace("{when}", state.booked)}
      </p>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <SlotPicker days={days} onChange={setChosen} />
      {state?.error && <p className="text-danger">{state.error}</p>}
      <button disabled={!chosen || pending} className="h-11 rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] hover:opacity-90 disabled:opacity-40">
        {pending ? "…" : label}
      </button>
    </form>
  );
}
