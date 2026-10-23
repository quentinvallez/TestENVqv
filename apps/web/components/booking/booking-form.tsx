"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/(public)/actions";
import type { SlotDay } from "@/lib/slots";
import { SlotPicker } from "./slot-picker";

const inputClass =
  "h-10 w-full rounded-md border border-line bg-panel px-3 outline-none transition-colors placeholder:text-faint focus:border-line-strong";

export function BookingForm({ days, action }: { days: SlotDay[]; action: (state: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <section>
        <h2 className="mb-3 font-medium">1. Choose a time</h2>
        <SlotPicker days={days} onChange={setChosen} />
      </section>

      <section className={chosen ? undefined : "pointer-events-none opacity-40"}>
        <h2 className="mb-3 font-medium">2. Your details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="firstName" required placeholder="First name" autoComplete="given-name" className={inputClass} />
          <input name="lastName" placeholder="Last name" autoComplete="family-name" className={inputClass} />
          <input name="email" type="email" required placeholder="Email" autoComplete="email" className={`${inputClass} sm:col-span-2`} />
          <input name="phone" type="tel" placeholder="Phone (for WhatsApp updates)" autoComplete="tel" className={`${inputClass} sm:col-span-2`} />
          <textarea name="message" rows={2} placeholder="Anything we should know? (optional)" className={`${inputClass} h-auto py-2 sm:col-span-2`} />
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        </div>
        <label className="mt-3 flex items-start gap-2 text-muted">
          <input type="checkbox" name="whatsapp" className="mt-0.5" />
          Send my confirmation and reminder on WhatsApp too
        </label>
      </section>

      {state?.error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{state.error}</p>}

      <button
        disabled={!chosen || pending}
        className="h-11 rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {pending ? "Booking…" : "Confirm viewing"}
      </button>
    </form>
  );
}
