"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import type { AgentFormState } from "../actions";
import { useT } from "@/lib/i18n/client";

type Action = (state: AgentFormState, form: FormData) => Promise<AgentFormState>;

const field = "h-8 w-full min-w-0 rounded-md border border-line bg-panel px-2.5 outline-none focus:border-line-strong";

/** "Add agent" in the page header: name, email (any address, also a personal one) and phone. */
export function AddAgent({ action }: { action: Action }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  useEffect(() => {
    if (state?.saved) setOpen(false);
  }, [state]);
  if (!open) {
    return (
      <Button size="sm" type="button" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        {t("Add agent")}
      </Button>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 p-4 pt-24" onClick={() => setOpen(false)}>
      <form action={formAction} onClick={(e) => e.stopPropagation()} className="flex w-full max-w-sm flex-col gap-2 rounded-lg border border-line bg-panel p-4 shadow-lg">
        <div className="font-medium">{t("Add agent")}</div>
        <input name="name" placeholder={t("Name")} className={field} required autoFocus />
        <input name="email" type="email" placeholder={t("Email (booking alerts go here)")} className={field} />
        <input name="phone" type="tel" placeholder={t("Phone (optional)")} className={field} />
        {state?.error && <p className="text-danger">{state.error}</p>}
        <div className="flex gap-2">
          <Button variant="primary" size="sm" disabled={pending}>
            {pending ? t("Saving…") : t("Add")}
          </Button>
          <Button size="sm" type="button" onClick={() => setOpen(false)}>
            {t("Cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** The agent's email with an edit button (works on touch, no hover needed). */
export function AgentEmail({ agentId, email, action }: { agentId: string; email: string | null; action: Action }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  useEffect(() => {
    if (state?.saved) setEditing(false);
  }, [state]);
  if (!editing) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className={email ? "truncate" : "truncate text-faint"}>{email ?? t("No email yet")}</span>
        <button type="button" onClick={() => setEditing(true)} className="shrink-0 rounded p-1 text-muted hover:bg-hover hover:text-fg" aria-label={email ? t("Change email") : t("Add email")}>
          <Pencil className="size-3" />
        </button>
      </span>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="agentId" value={agentId} />
      <div className="flex items-center gap-1.5">
        <input name="email" type="email" defaultValue={email ?? ""} placeholder="name@example.be" className={field} autoFocus />
        <Button variant="primary" size="sm" disabled={pending}>
          {t("Save")}
        </Button>
        <Button size="sm" type="button" onClick={() => setEditing(false)}>
          {t("Cancel")}
        </Button>
      </div>
      {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
    </form>
  );
}
