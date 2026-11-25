"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { requestAccessAction } from "./actions";
import { useT } from "@/lib/i18n/client";

const inputClass =
  "h-9 w-full rounded-md border border-line bg-panel px-3 outline-none transition-colors placeholder:text-faint focus:border-line-strong focus:ring-2 focus:ring-hover";

function Field({ label, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-muted">
        {label}
        {hint && <span className="font-normal text-faint"> · {hint}</span>}
      </span>
      <input className={inputClass} {...props} />
    </label>
  );
}

export function RequestAccessForm() {
  const t = useT();
  const [state, action, pending] = useActionState(requestAccessAction, undefined);

  if (state?.done) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[20px] font-semibold tracking-tight">{t("Thanks, we have your request")}</h1>
        <p className="text-muted">
          {t("We look at every request ourselves and usually answer within one working day. Once approved, you get an email with a link to set your password and create your workspace.")}
        </p>
        <Link href="/login" className="text-fg underline-offset-2 hover:underline">
          {t("Back to login")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">{t("Request access")}</h1>
        <p className="mt-1 text-muted">{t("Tell us about your agency. We approve each workspace ourselves and email you a link to get started.")}</p>
      </div>
      <Field label={t("Agency name")} name="agency" required minLength={2} placeholder="Immo Peeters" autoComplete="organization" />
      <Field label={t("Agency website")} name="website" placeholder="immopeeters.be" autoComplete="url" inputMode="url" />
      <Field label={t("Your name")} name="name" required minLength={2} placeholder="Sofie Peeters" autoComplete="name" />
      <Field label={t("Work email")} name="email" type="email" required placeholder="you@agency.be" autoComplete="email" />
      <Field label={t("Phone")} hint={t("optional")} name="phone" type="tel" placeholder="+32 470 12 34 56" autoComplete="tel" />
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">
          {t("Anything we should know")} <span className="font-normal text-faint">· {t("optional")}</span>
        </span>
        <textarea
          name="note"
          rows={3}
          maxLength={1000}
          className="w-full rounded-md border border-line bg-panel px-3 py-2 outline-none transition-colors placeholder:text-faint focus:border-line-strong focus:ring-2 focus:ring-hover"
          placeholder={t("Number of agents, which portals you use…")}
        />
      </label>
      {/* Hidden from people; bots fill it in. */}
      <input type="text" name="company_url" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {state?.error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{state.error}</p>}
      <p className="text-[12px] text-muted">{t("We only use these details to answer your request.")}</p>
      <Button variant="primary" className="h-9" disabled={pending}>
        {pending ? t("One moment…") : t("Request access")}
      </Button>
      <p className="text-center text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-fg underline-offset-2 hover:underline">
          {t("Log in")}
        </Link>
      </p>
    </form>
  );
}
