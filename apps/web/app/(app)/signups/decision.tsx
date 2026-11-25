"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import type { DecisionState } from "./actions";
import { useT } from "@/lib/i18n/client";

export function Decision({
  approve,
  decline,
  approveLabel,
}: {
  approve: (state: DecisionState) => Promise<DecisionState>;
  decline: (() => Promise<void>) | null;
  approveLabel: string;
}) {
  const t = useT();
  const [state, approveAction, pending] = useActionState(approve, undefined);
  return (
    <div className="flex flex-col items-start gap-1.5 md:items-end">
      <div className="flex items-center gap-1.5">
        <form action={approveAction}>
          <Button size="sm" variant="primary" disabled={pending}>
            {pending ? t("Sending…") : approveLabel}
          </Button>
        </form>
        {decline && (
          <form action={decline}>
            <Button size="sm" variant="ghost">
              {t("Decline")}
            </Button>
          </form>
        )}
      </div>
      {state?.message && <p className="max-w-[280px] text-[12px] text-muted md:text-right">{state.message}</p>}
      {state?.link && <code className="max-w-[280px] break-all text-[12px]">{state.link}</code>}
      {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
    </div>
  );
}
