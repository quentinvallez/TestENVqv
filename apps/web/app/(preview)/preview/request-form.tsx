"use client";

import { useActionState } from "react";
import type { WidgetLang } from "@/lib/widget-i18n";
import type { PreviewRequestState } from "./actions";

const text = {
  nl: { website: "Website van je kantoor", email: "Je e-mail", submit: "Toon mijn preview", busy: "We lezen je website… (tot een minuut)", privacy: "We gebruiken je e-mail alleen om je over deze preview te contacteren.", off: "Previews aanvragen kan hier nog niet." },
  fr: { website: "Site de votre agence", email: "Votre e-mail", submit: "Voir mon aperçu", busy: "Nous lisons votre site… (jusqu'à une minute)", privacy: "Nous utilisons votre e-mail uniquement pour vous contacter au sujet de cet aperçu.", off: "Les aperçus ne peuvent pas encore être demandés ici." },
  en: { website: "Your agency's website", email: "Your email", submit: "Show my preview", busy: "Reading your website… (up to a minute)", privacy: "We only use your email to contact you about this preview.", off: "Previews can't be requested here yet." },
};

const field = "h-10 w-full rounded-md border border-line bg-panel px-3 outline-none placeholder:text-faint focus:border-line-strong";

export function RequestForm({ lang, action, enabled }: { lang: WidgetLang; action: (state: PreviewRequestState, form: FormData) => Promise<PreviewRequestState>; enabled: boolean }) {
  const t = text[lang];
  const [state, formAction, pending] = useActionState(action, undefined);
  if (!enabled) return <p className="text-muted">{t.off}</p>;
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-muted">{t.website}</span>
        <input name="website" required placeholder="www.uwkantoor.be" inputMode="url" autoComplete="url" className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-muted">{t.email}</span>
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state?.error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{state.error}</p>}
      <button disabled={pending} className="mt-1 h-10 rounded-md bg-primary font-medium text-primary-fg hover:opacity-90 disabled:opacity-60">
        {pending ? t.busy : t.submit}
      </button>
      <p className="text-[11px] text-faint">{t.privacy}</p>
    </form>
  );
}
