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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

async function createAgency(name: string) {
  const suffix = Math.random().toString(36).slice(2, 6);
  const { error } = await authClient.organization.create({ name, slug: `${slugify(name) || "agency"}-${suffix}` });
  if (error) throw new Error(error.message);
}

export function AuthForm({ mode }: { mode: "login" | "signup" | "onboarding" }) {
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
      if (mode === "login") {
        const { error } = await authClient.signIn.email({ email: get("email"), password: get("password") });
        if (error) throw new Error(error.message);
      } else if (mode === "signup") {
        const { error } = await authClient.signUp.email({ name: get("name"), email: get("email"), password: get("password") });
        if (error) throw new Error(error.message);
        await createAgency(get("agency"));
      } else {
        await createAgency(get("agency"));
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  const title = { login: "Log in", signup: "Create your workspace", onboarding: "Name your agency" }[mode];
  const subtitle = {
    login: "Welcome back.",
    signup: "Set up your agency in under a minute.",
    onboarding: "You need an agency workspace to continue.",
  }[mode];

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-muted">{subtitle}</p>
      </div>
      {mode === "signup" && <Field label="Your name" name="name" required autoComplete="name" placeholder="Sofie Peeters" />}
      {mode !== "login" && <Field label="Agency name" name="agency" required placeholder="Immo Peeters" />}
      {mode !== "onboarding" && (
        <>
          <Field label="Work email" name="email" type="email" required autoComplete="email" placeholder="you@agency.be" />
          <Field
            label="Password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </>
      )}
      {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{error}</p>}
      <Button variant="primary" className="h-9" disabled={pending}>
        {pending ? "One moment…" : mode === "login" ? "Log in" : "Continue"}
      </Button>
      {mode === "login" && (
        <p className="text-center text-muted">
          New here?{" "}
          <Link href="/signup" className="text-fg underline-offset-2 hover:underline">
            Create a workspace
          </Link>
        </p>
      )}
      {mode === "signup" && (
        <p className="text-center text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-fg underline-offset-2 hover:underline">
            Log in
          </Link>
        </p>
      )}
    </form>
  );
}
