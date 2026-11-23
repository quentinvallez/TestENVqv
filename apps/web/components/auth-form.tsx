"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui";

const inputClass =
  "h-9 w-full rounded-md border border-line bg-panel px-3 outline-none transition-colors placeholder:text-faint focus:border-line-strong focus:ring-2 focus:ring-hover";

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      <input className={inputClass} {...props} />
    </label>
  );
}

/** The login form. New logins come from an invitation or an approved workspace request, never from here. */
export function AuthForm({ notice }: { notice?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const get = (key: string) => String(form.get(key) ?? "").trim();
    setError(null);
    setPending(true);
    try {
      const { error } = await authClient.signIn.email({ email: get("email"), password: get("password") });
      if (error) throw new Error(error.message);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }


  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Log in</h1>
        <p className="mt-1 text-muted">Welcome back.</p>
      </div>
      {notice && <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-success">{notice}</p>}
      <Field label="Work email" name="email" type="email" required autoComplete="email" placeholder="you@agency.be" />
      <Field label="Password" name="password" type="password" required minLength={8} autoComplete="current-password" />
      <Link href="/forgot-password" className="-mt-2 self-end text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline">
        Forgot password?
      </Link>
      {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{error}</p>}
      <Button variant="primary" className="h-9" disabled={pending}>
        {pending ? "One moment…" : "Log in"}
      </Button>
      <p className="text-center text-muted">
        New agency?{" "}
        <Link href="/signup" className="text-fg underline-offset-2 hover:underline">
          Request access
        </Link>
      </p>
    </form>
  );
}
