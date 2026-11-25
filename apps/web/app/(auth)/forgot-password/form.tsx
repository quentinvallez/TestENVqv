"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/client";

const inputClass =
  "h-9 w-full rounded-md border border-line bg-panel px-3 outline-none transition-colors placeholder:text-faint focus:border-line-strong focus:ring-2 focus:ring-hover";

/** Asks for the email address and sends the reset link. Says the same whether or not the address has a login. */
export function ForgotPasswordForm() {
  const t = useT();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setError(null);
    setPending(true);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    if (error) setError(error.message ?? t("Something went wrong"));
    else setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[20px] font-semibold tracking-tight">{t("Check your email")}</h1>
        <p className="text-muted">
          {t.rich("If <b>{email}</b> has a login, we've sent it a link to choose a new password. The link works for 1 hour.", { b: (c) => <span className="text-fg">{c}</span> }, { email: sentTo })}
        </p>
        <Link href="/login" className="text-center text-muted underline-offset-2 hover:text-fg hover:underline">
          {t("Back to log in")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">{t("Forgot your password?")}</h1>
        <p className="mt-1 text-muted">{t("We'll email you a link to choose a new one.")}</p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">{t("Work email")}</span>
        <input className={inputClass} name="email" type="email" required autoComplete="email" placeholder="you@agency.be" />
      </label>
      {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{error}</p>}
      <Button variant="primary" className="h-9" disabled={pending}>
        {pending ? t("One moment…") : t("Send the link")}
      </Button>
      <Link href="/login" className="text-center text-muted underline-offset-2 hover:text-fg hover:underline">
        {t("Back to log in")}
      </Link>
    </form>
  );
}
