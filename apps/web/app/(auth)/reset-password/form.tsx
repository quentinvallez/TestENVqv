"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/client";

const inputClass =
  "h-9 w-full rounded-md border border-line bg-panel px-3 outline-none transition-colors placeholder:text-faint focus:border-line-strong focus:ring-2 focus:ring-hover";

const linkClass = "text-center text-muted underline-offset-2 hover:text-fg hover:underline";

/** The page the reset link opens: choose a new password, then log in with it. */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[20px] font-semibold tracking-tight">{t("This link no longer works")}</h1>
        <p className="text-muted">{t("Reset links work for 1 hour and only once. Ask for a new one.")}</p>
        <Link href="/forgot-password" className={linkClass}>
          {t("Send a new link")}
        </Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("repeat") ?? "")) return setError("The two passwords are not the same.");
    setError(null);
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
    if (error) {
      setPending(false);
      return setError(error.code === "INVALID_TOKEN" ? t("This link no longer works. Ask for a new one.") : (error.message ?? t("Something went wrong")));
    }
    router.push("/login?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">{t("Choose a new password")}</h1>
        <p className="mt-1 text-muted">{t("At least 8 characters. You'll be logged out everywhere else.")}</p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">{t("New password")}</span>
        <input className={inputClass} name="password" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">{t("Repeat it")}</span>
        <input className={inputClass} name="repeat" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{error}</p>}
      <Button variant="primary" className="h-9" disabled={pending}>
        {pending ? t("One moment…") : t("Save the new password")}
      </Button>
    </form>
  );
}
