"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarCheck, Check } from "lucide-react";
import type { WidgetState } from "@/app/(public)/actions";
import { cn } from "@/lib/cn";
import type { SlotDay } from "@/lib/slots";
import { widgetText, type WidgetLang } from "@/lib/widget-i18n";
import { SlotPicker } from "./slot-picker";

export type WidgetQuestion = { id: string; question: string; options: { id: string; label: string }[] };

const inputClass =
  "h-10 w-full rounded-md border border-line bg-panel px-3 outline-none transition-colors placeholder:text-faint focus:border-[var(--brand)]";

/**
 * The planner as clients see it: pick a time, answer a few qualifying
 * questions, leave details. Used on the booking page and inside the embeddable widget.
 */
export function BookingWidget({
  lang,
  days,
  questions,
  agentName,
  slotMinutes,
  agencyName,
  awaitingOccupant = false,
  occupied = false,
  action,
}: {
  lang: WidgetLang;
  days: SlotDay[];
  questions: WidgetQuestion[];
  agentName: string;
  slotMinutes: number;
  agencyName: string;
  /** The occupants haven't given visiting times yet. */
  awaitingOccupant?: boolean;
  /** Someone lives there and sees who comes, by first name and initial. */
  occupied?: boolean;
  action: (state: WidgetState, form: FormData) => Promise<WidgetState>;
}) {
  const t = widgetText[lang];
  const [state, formAction, pending] = useActionState(action, undefined);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [slot, setSlot] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const firstName = agentName.split(" ")[0] ?? agentName;
  // Without any free time, visitors leave their details instead of picking one.
  const requesting = days.length === 0;

  // Let a parent page size the iframe to the content.
  useEffect(() => {
    if (window.parent === window) return;
    // Measure the content itself: the document never reports less than the iframe's current height.
    const root = document.querySelector("[data-embed-root]") ?? document.body;
    const post = () => window.parent.postMessage({ type: "viewing-widget-height", height: Math.ceil(root.getBoundingClientRect().height) }, "*");
    post();
    const observer = new ResizeObserver(post);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  if (state?.requested) {
    return (
      <div className="flex flex-col items-center px-2 py-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-fg)]">
          <Check className="size-5" />
        </span>
        <h3 className="mt-3 text-[16px] font-semibold">{t.requestDoneTitle}</h3>
        <p className="mt-2 max-w-xs text-muted">{t.requestDoneText(agencyName)}</p>
      </div>
    );
  }

  if (state?.booked) {
    return (
      <div className="flex flex-col items-center px-2 py-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-fg)]">
          <Check className="size-5" />
        </span>
        <h3 className="mt-3 text-[16px] font-semibold">{t.doneTitle}</h3>
        <p className="mt-1 font-medium">{state.booked.when}</p>
        <p className="mt-1 text-muted">{t.with(slotMinutes, agentName)}</p>
        <p className="mt-4 max-w-xs text-muted">{t.doneText}</p>
        <a href={state.booked.manageUrl} target="_top" className="mt-3 font-medium text-[var(--brand)] underline-offset-2 hover:underline">
          {t.manage}
        </a>
      </div>
    );
  }

  const stepClass = (n: number) => cn(n === step ? "block" : "hidden");
  const progress = questions.length ? [1, 2, 3] : [1, 3];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="startsAt" value={slot ?? ""} />
      {requesting && <input type="hidden" name="request" value="1" />}
      {Object.entries(answers).map(([id, value]) => (
        <input key={id} type="hidden" name={`q-${id}`} value={value} />
      ))}

      <div className="flex items-center gap-1.5">
        {progress.map((n) => (
          <span key={n} className={cn("h-1 flex-1 rounded-full", n <= step ? "bg-[var(--brand)]" : "bg-line")} />
        ))}
      </div>

      <section className={stepClass(1)}>
        <h3 className="mb-1 font-medium">{t.step1}</h3>
        <p className="mb-3 flex items-center gap-1.5 text-[12px] text-muted">
          <CalendarCheck className="size-3.5" />
          {t.with(slotMinutes, agentName)}
        </p>
        {requesting ? (
          <p className="rounded-lg border border-line px-4 py-6 text-center text-muted">{awaitingOccupant ? t.awaitingOwner : t.noSlotsRequest}</p>
        ) : (
          <SlotPicker days={days} onChange={setSlot} />
        )}
        <button
          type="button"
          disabled={!slot && !requesting}
          onClick={() => setStep(questions.length ? 2 : 3)}
          className="mt-4 h-10 w-full rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {t.next}
        </button>
      </section>

      {questions.length > 0 && (
        <section className={stepClass(2)}>
          <h3 className="font-medium">{t.step2}</h3>
          <p className="mb-3 text-[12px] text-muted">{t.step2Hint(firstName)}</p>
          <div className="flex flex-col gap-4">
            {questions.map((q) => (
              <fieldset key={q.id}>
                <legend className="mb-1.5">{q.question}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((o) => (
                    <button
                      type="button"
                      key={o.id}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                      className={cn(
                        "rounded-full border px-3 py-1.5 transition-colors",
                        answers[q.id] === o.id ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]" : "border-line hover:border-line-strong",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setStep(1)} className="h-10 rounded-md border border-line px-4 hover:bg-hover">
              {t.back}
            </button>
            <button type="button" onClick={() => setStep(3)} className="h-10 flex-1 rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] hover:opacity-90">
              {Object.keys(answers).length ? t.next : t.skip}
            </button>
          </div>
        </section>
      )}

      <section className={stepClass(3)}>
        <h3 className="mb-3 font-medium">{t.step3}</h3>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <input name="firstName" required placeholder={t.firstName} autoComplete="given-name" className={inputClass} />
          <input name="lastName" placeholder={t.lastName} autoComplete="family-name" className={inputClass} />
          <input name="email" type="email" required placeholder={t.email} autoComplete="email" className={`${inputClass} sm:col-span-2`} />
          <input name="phone" type="tel" placeholder={t.phone} autoComplete="tel" className={`${inputClass} sm:col-span-2`} />
          <textarea name="message" rows={2} placeholder={t.message} className={`${inputClass} h-auto py-2 sm:col-span-2`} />
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        </div>
        <label className="mt-3 flex items-start gap-2 text-muted">
          <input type="checkbox" name="whatsapp" className="mt-0.5 accent-[var(--brand)]" />
          {t.whatsapp}
        </label>
        {state?.error && <p className="mt-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{state.error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setStep(questions.length ? 2 : 1)} className="h-11 rounded-md border border-line px-4 hover:bg-hover">
            {t.back}
          </button>
          <button disabled={(!slot && !requesting) || pending} className="h-11 flex-1 rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] transition-opacity hover:opacity-90 disabled:opacity-40">
            {pending ? t.booking : requesting ? t.request : t.confirm}
          </button>
        </div>
      </section>

      <p className="text-center text-[11px] text-faint">
        {t.privacy(agencyName)}
        {occupied && ` ${t.privacyOccupant}`}
      </p>
    </form>
  );
}
