"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { createWorkspaceAction } from "./actions";

const inputClass =
  "h-9 w-full rounded-md border border-line bg-panel px-3 outline-none transition-colors placeholder:text-faint focus:border-line-strong focus:ring-2 focus:ring-hover";

type Props = {
  token: string;
  agencyName: string;
  email: string;
  name: string;
  hasAccount: boolean;
  signedInAs: string | null;
  dpa: { url: string; version: string } | null;
};

export function JoinForm({ token, agencyName, email, name, hasAccount, signedInAs, dpa }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sameUser = signedInAs?.toLowerCase() === email.toLowerCase();

  async function create(form: FormData) {
    setError(null);
    setPending(true);
    try {
      if (!sameUser) {
        const password = String(form.get("password") ?? "");
        const result = hasAccount
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: String(form.get("name") ?? "").trim() || name });
        if (result.error) throw new Error(result.error.message);
      }
      const created = await createWorkspaceAction(token, form.get("dpa") === "on");
      if ("error" in created) throw new Error(created.error);
      await authClient.organization.setActive({ organizationId: created.agencyId });
      // First stop: the two setup steps, with the website they gave us filled in.
      router.push(created.website ? `/widget?website=${encodeURIComponent(created.website)}` : "/widget");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  if (signedInAs && !sameUser) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[20px] font-semibold tracking-tight">Create {agencyName}</h1>
        <p className="rounded-md border border-line px-3 py-2 text-muted">
          You&apos;re logged in as {signedInAs}, but this workspace is for {email}. Log out first, then open the link again.
        </p>
        <Button
          className="h-9"
          onClick={async () => {
            await authClient.signOut();
            router.refresh();
          }}
        >
          Log out
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void create(new FormData(e.currentTarget));
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Create {agencyName}</h1>
        <p className="mt-1 text-muted">
          {sameUser ? "You're logged in. Create the workspace to start." : hasAccount ? "Log in to create the workspace." : "Choose a password for your login."}
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">Email</span>
        <input className={`${inputClass} text-muted`} value={email} readOnly />
      </label>
      {!sameUser && !hasAccount && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">Your name</span>
          <input className={inputClass} name="name" defaultValue={name} required autoComplete="name" />
        </label>
      )}
      {!sameUser && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">{hasAccount ? "Password" : "Choose a password"}</span>
          <input className={inputClass} name="password" type="password" required minLength={8} autoComplete={hasAccount ? "current-password" : "new-password"} />
        </label>
      )}
      {dpa && (
        <label className="flex items-start gap-2 text-muted">
          <input type="checkbox" name="dpa" required className="mt-0.5 size-4 flex-none accent-[var(--primary)]" />
          <span>
            I accept the{" "}
            <a href={dpa.url} target="_blank" rel="noreferrer" className="text-fg underline underline-offset-2">
              data processing agreement
            </a>{" "}
            on behalf of {agencyName}.
          </span>
        </label>
      )}
      {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{error}</p>}
      <Button variant="primary" className="h-9" disabled={pending}>
        {pending ? "One moment…" : "Create the workspace"}
      </Button>
    </form>
  );
}
