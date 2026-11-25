"use client";

import { useActionState, useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { DraftState } from "./actions";

const field = "h-8 w-full rounded-md border border-line bg-panel px-2.5 outline-none focus:border-line-strong";

/** Demo helper: pretend a request came in, and watch the planner handle it. */
export function SimulateMessage({
  action,
  listings,
}: {
  action: (state: DraftState, form: FormData) => Promise<DraftState>;
  listings: { id: string; label: string }[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("immoweb");
  const [state, formAction, pending] = useActionState(action, undefined);
  const portal = true;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FlaskConical className="size-3.5" />
        <span className="sm:hidden">{t("Simulate")}</span>
        <span className="hidden sm:inline">{t("Simulate a request")}</span>
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[10vh]" onClick={() => setOpen(false)}>
          <form action={formAction} onClick={(e) => e.stopPropagation()} className="w-full max-w-[480px] rounded-xl border border-line bg-panel p-5 shadow-2xl shadow-black/10">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-[15px] font-semibold">{t("Simulate a request")}</h2>
                <p className="mt-0.5 text-muted">{t("Handled as a real one: a visit request with an email address gets the booking link on its own, anything else waits for you.")}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-fg">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <select name="provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={field}>
                <option value="immoweb">Immoweb</option>
                <option value="zimmo">Zimmo</option>
                <option value="immovlan">Immovlan</option>
                <option value="immoscoop">Immoscoop</option>
                <option value="website">{t("Website contact form")}</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input name="name" placeholder={t("Name")} className={field} required />
                <input name="contact" placeholder={t("Email or phone")} className={field} required />
              </div>
              <select name="listingId" className={field} defaultValue="" required={portal}>
                <option value="">{portal ? t("Which listing?") : t("About which listing? (optional)")}</option>
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <textarea name="body" rows={4} required placeholder="e.g. Ik zou dit appartement graag bezoeken. Is er een lift?" className={`${field} h-auto py-2`} />
              {state?.error && <p className="text-danger">{state.error}</p>}
              <Button variant="primary" disabled={pending}>
                {pending ? t("The planner is reading…") : t("Receive request")}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
