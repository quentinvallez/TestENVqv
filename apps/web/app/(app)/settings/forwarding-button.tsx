"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import type { ForwardingState } from "../actions";

export function ForwardingButton({ action, label, variant = "secondary" }: { action: (state: ForwardingState) => Promise<ForwardingState>; label: string; variant?: "primary" | "secondary" }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button size="sm" variant={variant} disabled={pending}>
        {pending ? "Working…" : label}
      </Button>
      {state?.error && <p className="max-w-60 text-right text-[12px] text-danger">{state.error}</p>}
    </form>
  );
}

/** The agency's fallback address for lead copies, e.g. info@agency.be. */
export function CopyAddressForm({ action, value }: { action: (state: ForwardingState, form: FormData) => Promise<ForwardingState>; value: string | null }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          name="address"
          type="email"
          defaultValue={value ?? ""}
          placeholder="info@your-agency.be"
          className="h-8 w-full min-w-0 max-w-72 rounded-md border border-line bg-panel px-2.5 outline-none focus:border-line-strong"
        />
        <Button size="sm" disabled={pending}>
          {state?.done && !pending ? "Saved" : "Save"}
        </Button>
      </div>
      {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
    </form>
  );
}
