"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/(public)/actions";
import type { SlotDay } from "@/lib/slots";
import { SlotPicker } from "./slot-picker";

export function RescheduleForm({ days, action }: { days: SlotDay[]; action: (state: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <SlotPicker days={days} onChange={setChosen} />
      {state?.error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{state.error}</p>}
      <button
        disabled={!chosen || pending}
        className="h-10 rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {pending ? "Saving…" : "Move my viewing"}
      </button>
    </form>
  );
}
