"use client";

import { useActionState, useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { DraftState } from "./actions";

const field = "h-8 w-full rounded-md border border-line bg-panel px-2.5 outline-none focus:border-line-strong";

/** Demo helper: pretend a client wrote in, and watch the planner handle it. */
export function SimulateMessage({
  action,
  listings,
}: {
  action: (state: DraftState, form: FormData) => Promise<DraftState>;
  listings: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("whatsapp_business");
  const [state, formAction, pending] = useActionState(action, undefined);
  const whatsapp = provider === "whatsapp_business";
  const portal = provider === "immoweb" || provider === "zimmo";

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FlaskConical className="size-3.5" />
        <span className="sm:hidden">Simulate</span>
        <span className="hidden sm:inline">Simulate incoming message</span>
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[10vh]" onClick={() => setOpen(false)}>
          <form action={formAction} onClick={(e) => e.stopPropagation()} className="w-full max-w-[480px] rounded-xl border border-line bg-panel p-5 shadow-2xl shadow-black/10">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-[15px] font-semibold">Simulate an incoming message</h2>
                <p className="mt-0.5 text-muted">The planner sorts it and drafts a reply, as it will for real mail and WhatsApp.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-fg">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <select name="provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={field}>
                <option value="whatsapp_business">WhatsApp Business</option>
                <option value="outlook">Outlook</option>
                <option value="gmail">Gmail</option>
                <option value="immoweb">Immoweb lead</option>
                <option value="zimmo">Zimmo lead</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input name="name" placeholder="Name" className={field} required />
                <input name="contact" placeholder={whatsapp ? "+32 470 12 34 56" : "client@example.com"} className={field} required />
              </div>
              {!whatsapp && !portal && <input name="subject" placeholder="Subject" className={field} />}
              <select name="listingId" className={field} defaultValue="" required={portal}>
                <option value="">{portal ? "Which listing?" : "About which listing? (optional)"}</option>
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <textarea name="body" rows={4} required placeholder="e.g. Bonjour, je ne peux plus venir samedi, est-ce possible la semaine prochaine ?" className={`${field} h-auto py-2`} />
              {state?.error && <p className="text-danger">{state.error}</p>}
              <Button variant="primary" disabled={pending}>
                {pending ? "The planner is reading…" : "Receive message"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
