"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import type { InviteState } from "../team-actions";
import { useT } from "@/lib/i18n/client";

/** "Invite to log in" / "Send again", with the outcome under it. */
export function InviteButton({ action, again, disabled }: { action: (state: InviteState) => Promise<InviteState>; again?: boolean; disabled?: boolean }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <div>
        <Button size="sm" variant={again ? "secondary" : "primary"} disabled={pending || disabled}>
          {pending ? t("Sending…") : again ? t("Send again") : t("Invite to log in")}
        </Button>
      </div>
      {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
      {state?.sent && <p className="text-[12px] text-success">{t("Invitation sent.")}</p>}
    </form>
  );
}
