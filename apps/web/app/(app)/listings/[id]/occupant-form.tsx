"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import type { OccupantState } from "../../actions";
import { useT } from "@/lib/i18n/client";

const field = "h-8 w-full rounded-md border border-line bg-panel px-2 outline-none focus:border-line-strong";

/** Adds the owner or tenant; the invitation with their link waits for approval under Viewing requests. */
export function OccupantForm({ defaultRole, action }: { defaultRole: "owner" | "tenant"; action: (state: OccupantState, form: FormData) => Promise<OccupantState> }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="firstName" required placeholder={t("First name")} className={field} />
        <input name="lastName" placeholder={t("Last name")} className={field} />
        <input name="email" type="email" placeholder={t("Email")} className={field} />
        <input name="phone" type="tel" placeholder={t("Phone")} className={field} />
        <select name="role" defaultValue={defaultRole} className={field}>
          <option value="owner">{t("Owner")}</option>
          <option value="tenant">{t("Tenant")}</option>
        </select>
        <select name="language" defaultValue="nl" className={field}>
          <option value="nl">Nederlands</option>
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-muted">
        <input type="checkbox" name="whatsapp" />
        {t("Send alerts on WhatsApp (they agreed)")}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={pending}>
          {pending ? t("Adding…") : t("Add and draft invitation")}
        </Button>
        {state?.added && <span className="text-success">{t("Added. The invitation with their link waits for your OK under Viewing requests.")}</span>}
        {state?.error && <span className="text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
