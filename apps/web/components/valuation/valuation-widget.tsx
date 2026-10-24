"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, MessageCircle, ShieldCheck } from "lucide-react";
import type { ValuationRequestState, VerifyState } from "@/app/(public)/valuation-actions";
import { cn } from "@/lib/cn";
import { valuationText } from "@/lib/valuation-i18n";
import type { WidgetLang } from "@/lib/widget-i18n";

const input = "h-10 w-full rounded-md border border-line bg-panel px-3 outline-none placeholder:text-faint focus:border-[var(--brand)]";
const euro = (n: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function Chips({ name, options, value, onChange, multiple }: { name: string; options: Record<string, string>; value: string[]; onChange: (v: string[]) => void; multiple?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {value.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      {Object.entries(options).map(([id, label]) => {
        const on = value.includes(id);
        return (
          <button
            type="button"
            key={id}
            onClick={() => onChange(multiple ? (on ? value.filter((v) => v !== id) : [...value, id]) : on ? [] : [id])}
            className={cn("rounded-full border px-3 py-1.5", on ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]" : "border-line hover:border-line-strong")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-[12px] text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Home valuation for owners: four short steps, phone confirmation, then the estimate. */
export function ValuationWidget({
  lang,
  agencyName,
  request,
  verify,
}: {
  lang: WidgetLang;
  agencyName: string;
  request: (state: ValuationRequestState | undefined, form: FormData) => Promise<ValuationRequestState>;
  verify: (token: string, state: VerifyState, form: FormData) => Promise<VerifyState>;
}) {
  const t = valuationText[lang];
  const [step, setStep] = useState(0);
  const [type, setType] = useState<string[]>(["house"]);
  const [condition, setCondition] = useState<string[]>(["good"]);
  const [epc, setEpc] = useState<string[]>([]);
  const [kitchen, setKitchen] = useState<string[]>(["standard"]);
  const [extras, setExtras] = useState<string[]>([]);
  const [plans, setPlans] = useState<string[]>([]);
  const [requested, requestAction, requesting] = useActionState(request, undefined);

  useEffect(() => {
    if (window.parent === window) return;
    const root = document.querySelector("[data-embed-root]") ?? document.body;
    const post = () => window.parent.postMessage({ type: "viewing-widget-height", height: Math.ceil(root.getBoundingClientRect().height) }, "*");
    post();
    const observer = new ResizeObserver(post);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  if (requested?.token) return <Verify t={t} lang={lang} requested={requested} action={(state, form) => verify(requested.token, state, form)} />;

  const show = (n: number) => (n === step ? "flex flex-col gap-3" : "hidden");
  const nav = (last = false) => (
    <div className="mt-2 flex gap-2">
      {step > 0 && (
        <button type="button" onClick={() => setStep(step - 1)} className="h-10 rounded-md border border-line px-4 hover:bg-hover">
          {t.back}
        </button>
      )}
      {last ? (
        <button disabled={requesting} className="h-11 flex-1 rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] hover:opacity-90 disabled:opacity-50">
          {requesting ? "…" : t.submit}
        </button>
      ) : (
        <button type="button" onClick={(e) => (e.currentTarget.form?.reportValidity() ?? true) && setStep(step + 1)} className="h-10 flex-1 rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] hover:opacity-90">
          {t.next}
        </button>
      )}
    </div>
  );

  return (
    <form action={requestAction} className="flex flex-col gap-4" noValidate={false}>
      <div>
        <p className="text-muted">{t.intro}</p>
        <div className="mt-3 flex gap-1.5">
          {t.steps.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={cn("h-1 rounded-full", i <= step ? "bg-[var(--brand)]" : "bg-line")} />
              <div className={cn("mt-1 text-[11px]", i === step ? "text-fg" : "text-faint")}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <section className={show(0)}>
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <Field label={t.street}>
            <input name="street" required={step === 0} autoComplete="address-line1" className={input} />
          </Field>
          <Field label={t.number}>
            <input name="houseNumber" className={input} />
          </Field>
          <Field label={t.postcode}>
            <input name="postcode" required={step === 0} inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="postal-code" className={input} />
          </Field>
        </div>
        <Field label={t.city}>
          <input name="city" required={step === 0} autoComplete="address-level2" className={input} />
        </Field>
        <Field label={t.type}>
          <Chips name="propertyType" options={t.types} value={type} onChange={(v) => setType(v.length ? v : type)} />
        </Field>
        {nav()}
      </section>

      <section className={show(1)}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t.livingArea}>
            <input name="livingArea" type="number" min={15} required={step === 1} className={input} />
          </Field>
          {type[0] !== "apartment" && (
            <Field label={t.plotArea}>
              <input name="plotArea" type="number" min={0} className={input} />
            </Field>
          )}
          <Field label={t.bedrooms}>
            <input name="bedrooms" type="number" min={0} max={20} defaultValue={3} className={input} />
          </Field>
          <Field label={t.bathrooms}>
            <input name="bathrooms" type="number" min={0} max={10} defaultValue={1} className={input} />
          </Field>
          <Field label={t.yearBuilt}>
            <input name="yearBuilt" type="number" min={1700} max={2100} className={input} />
          </Field>
        </div>
        {nav()}
      </section>

      <section className={show(2)}>
        <Field label={t.condition}>
          <Chips name="condition" options={t.conditions} value={condition} onChange={(v) => setCondition(v.length ? v : condition)} />
        </Field>
        <Field label={t.epc}>
          <Chips name="epcLabel" options={{ "A+": "A+", A: "A", B: "B", C: "C", D: "D", E: "E", F: "F" }} value={epc} onChange={setEpc} />
          <span className="text-[11px] text-faint">{epc.length ? "" : t.epcUnknown}</span>
        </Field>
        <Field label={t.kitchen}>
          <Chips name="kitchen" options={t.kitchens} value={kitchen} onChange={setKitchen} />
        </Field>
        <Field label={t.extras}>
          <Chips name="extras" options={t.extraOptions} value={extras} onChange={setExtras} multiple />
        </Field>
        {nav()}
      </section>

      <section className={show(3)}>
        <Field label={t.plans}>
          <Chips name="plans" options={t.planOptions} value={plans} onChange={setPlans} />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={t.firstName}>
            <input name="firstName" required={step === 3} autoComplete="given-name" className={input} />
          </Field>
          <Field label={t.phone}>
            <input name="phone" type="tel" required={step === 3} autoComplete="tel" placeholder="0470 12 34 56" className={input} />
          </Field>
          <Field label={t.email} className="sm:col-span-2">
            <input name="email" type="email" autoComplete="email" className={input} />
          </Field>
        </div>
        <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <label className="flex items-start gap-2 text-muted">
          <input type="checkbox" name="consent" required={step === 3} className="mt-0.5 accent-[var(--brand)]" />
          {t.consent(agencyName)}
        </label>
        {requested?.error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{requested.error}</p>}
        {nav(true)}
      </section>
    </form>
  );
}

function Verify({
  t,
  lang,
  requested,
  action,
}: {
  t: (typeof valuationText)["nl"];
  lang: WidgetLang;
  requested: Extract<ValuationRequestState, { token: string }>;
  action: (state: VerifyState, form: FormData) => Promise<VerifyState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  if (state?.verified) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-fg)]">
          <Check className="size-5" />
        </span>
        {state.hasEstimate ? (
          <>
            <div className="mt-3 text-[12px] text-muted">{t.resultTitle}</div>
            <div className="mt-1 text-[24px] font-semibold tracking-tight tabular-nums">
              {euro(state.low!)} – {euro(state.high!)}
            </div>
            <div className="mt-1 text-[12px] text-muted">{t.confidence[state.confidence!]}</div>
          </>
        ) : (
          <p className="mt-3 max-w-sm text-muted">{t.noEstimate}</p>
        )}
        <a href={`/v/${requested.token}?lang=${lang}`} target="_top" className="mt-4 h-10 rounded-md bg-[var(--brand)] px-4 leading-10 font-medium text-[var(--brand-fg)] hover:opacity-90">
          {t.fullReport}
        </a>
        <p className="mt-3 max-w-xs text-[11px] text-faint">{t.report.disclaimer}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-medium">
        <ShieldCheck className="size-4" />
        {t.verifyTitle}
      </h3>
      {requested.whatsappLink && (
        <>
          <a href={requested.whatsappLink} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-md bg-[#1fa855] font-medium text-white">
            <MessageCircle className="size-4" />
            {t.verifyWhatsApp}
          </a>
          <p className="text-[12px] text-muted">{t.verifyHint}</p>
        </>
      )}
      {requested.demoCode && <p className="rounded-md border border-line bg-hover px-3 py-2 text-[12px] text-muted">{t.demoCode(requested.demoCode)}</p>}
      <input name="code" inputMode="numeric" maxLength={6} placeholder={t.code} required className={`${input} text-center text-[18px] tracking-[0.3em]`} />
      {state?.error && <p className="text-danger">{state.error}</p>}
      <button disabled={pending} className="h-11 rounded-md bg-[var(--brand)] font-medium text-[var(--brand-fg)] hover:opacity-90 disabled:opacity-50">
        {pending ? "…" : t.verify}
      </button>
    </form>
  );
}
