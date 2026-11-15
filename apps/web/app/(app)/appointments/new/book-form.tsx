"use client";

import { useActionState, useState } from "react";
import { Button, Panel } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { BookForClientState } from "../../actions";

const field = "h-8 w-full rounded-md border border-line bg-panel px-2 outline-none focus:border-line-strong";

/** A select that shows the new choice straight away (reloads the free times). */
export function ChoiceSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

type Day = { label: string; times: { value: string; label: string; openHouse: boolean; spotsLeft?: number }[] };

export function BookForm({
  action,
  listingId,
  agentId,
  agentName,
  days,
  awaitingOccupant,
  contact,
}: {
  action: (state: BookForClientState, form: FormData) => Promise<BookForClientState>;
  listingId: string;
  agentId?: string;
  agentName: string;
  days: Day[];
  awaitingOccupant: boolean;
  contact: { id: string; name: string; detail: string; canConfirm: boolean } | null;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [choice, setChoice] = useState<string>("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState(false);
  const [confirm, setConfirm] = useState(true);
  const canConfirm = contact ? contact.canConfirm : Boolean(email || (whatsapp && phone));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="listingId" value={listingId} />
      {agentId && <input type="hidden" name="agentId" value={agentId} />}

      <Panel className="p-4">
        <div className="font-medium">When</div>
        <p className="mt-0.5 text-[12px] text-muted">Free times of {agentName} for this listing in the next two weeks.</p>
        {awaitingOccupant && <p className="mt-2 text-[12px] text-muted">The occupants haven't given their times yet, so there are no free times. A time you agree on must still suit them.</p>}
        <div className="mt-3 flex flex-col gap-3">
          {days.map((day) => (
            <div key={day.label}>
              <div className="mb-1.5 text-[12px] text-muted">{day.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {day.times.map((t) => (
                  <label
                    key={t.value}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 tabular-nums",
                      choice === t.value ? "border-fg bg-hover font-medium" : "border-line hover:bg-hover",
                    )}
                  >
                    <input type="radio" name="slot" value={t.value} className="sr-only" checked={choice === t.value} onChange={() => setChoice(t.value)} />
                    {t.label}
                    {t.openHouse && <span className="text-[11px] text-muted">open house · {t.spotsLeft} left</span>}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {days.length === 0 && !awaitingOccupant && <p className="text-muted">No free times in the next two weeks.</p>}
          <label className={cn("flex cursor-pointer items-center gap-2", choice === "other" && "font-medium")}>
            <input type="radio" name="slot" value="other" checked={choice === "other"} onChange={() => setChoice("other")} />
            Another time we agreed
          </label>
          {choice === "other" && (
            <div className="flex flex-col gap-2 pl-6">
              <div className="grid max-w-xs grid-cols-2 gap-2">
                <input type="date" name="otherDate" required className={field} />
                <input type="time" name="otherTime" required step={300} className={field} />
              </div>
              <p className="text-[12px] text-muted">Outside the usual hours is fine. The agent must be free then, and an occupied home must allow it.</p>
            </div>
          )}
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="font-medium">Who</div>
        {contact ? (
          <div className="mt-2">
            <input type="hidden" name="contactId" value={contact.id} />
            <div>{contact.name}</div>
            <div className="text-[12px] text-muted">{contact.detail || "No phone or email yet"}</div>
          </div>
        ) : (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input name="firstName" required placeholder="First name" autoComplete="off" className={field} />
              <input name="lastName" placeholder="Last name" autoComplete="off" className={field} />
              <input name="phone" type="tel" placeholder="Phone" autoComplete="off" className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input name="email" type="email" placeholder="Email" autoComplete="off" className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
              <select name="language" defaultValue="" className={field}>
                <option value="">Language: unknown (English)</option>
                <option value="nl">Nederlands</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
            <p className="mt-2 text-[12px] text-muted">A phone number or an email is enough. A client we already know by that number or email is reused.</p>
            <label className="mt-2 flex items-center gap-2 text-muted">
              <input type="checkbox" name="whatsapp" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
              They agree to messages on WhatsApp
            </label>
          </>
        )}
        <textarea name="note" rows={2} placeholder="Note for the agent (optional)" className="mt-3 w-full rounded-md border border-line bg-panel px-2 py-1.5 outline-none focus:border-line-strong" />
      </Panel>

      <div className="flex flex-col gap-3">
        <label className={cn("flex items-start gap-2", !canConfirm && "text-muted")}>
          <input type="checkbox" name="confirm" checked={canConfirm && confirm} onChange={(e) => setConfirm(e.target.checked)} disabled={!canConfirm} className="mt-0.5" />
          <span>
            Send them the confirmation with the link to move or cancel
            <span className="block text-[12px] text-muted">
              {canConfirm ? "By email, or WhatsApp when they agreed. Fixed text in their language." : "Needs an email address, or a phone number with WhatsApp."}
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={pending || !choice}>
            {pending ? "Booking…" : "Book the viewing"}
          </Button>
          {state?.error && <span className="text-danger">{state.error}</span>}
        </div>
      </div>
    </form>
  );
}
