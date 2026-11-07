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
