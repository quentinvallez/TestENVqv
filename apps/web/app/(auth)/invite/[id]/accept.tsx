"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

const inputClass =
  "h-9 w-full rounded-md border border-line bg-panel px-3 outline-none transition-colors placeholder:text-faint focus:border-line-strong focus:ring-2 focus:ring-hover";

type Props = {
  invitationId: string;
  agencyId: string;
  agencyName: string;
  email: string;
  name: string;
  agentId: string | null;
  hasAccount: boolean;
  signedInAs: string | null;
};

export function AcceptInvitation({ invitationId, agencyId, agencyName, email, name, agentId, hasAccount, signedInAs }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sameUser = signedInAs?.toLowerCase() === email.toLowerCase();

  async function join(form?: FormData) {
    setError(null);
    setPending(true);
    try {
      if (!sameUser) {
        const password = String(form?.get("password") ?? "");
        const result = hasAccount
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: String(form?.get("name") ?? "").trim() || email.split("@")[0]! });
        if (result.error) throw new Error(result.error.message);
      }
      const accepted = await authClient.organization.acceptInvitation({ invitationId });
      if (accepted.error) throw new Error(accepted.error.message);
      await authClient.organization.setActive({ organizationId: agencyId });
      // First stop: their own page, to connect Outlook or Gmail.
      router.push(agentId ? `/agents/${agentId}?welcome=1` : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Join {agencyName}</h1>
        <p className="mt-1 text-muted">
          {sameUser ? "You're logged in. Join to see your viewings and connect your mailbox." : hasAccount ? "Log in to accept the invitation." : "Choose a password to set up your login."}
        </p>
      </div>
      {signedInAs && !sameUser ? (
        <>
          <p className="rounded-md border border-line px-3 py-2 text-muted">
            You&apos;re logged in as {signedInAs}, but this invitation is for {email}. Log out first, then open the link again.
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
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void join(new FormData(e.currentTarget));
          }}
          className="flex flex-col gap-4"
        >
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
          {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{error}</p>}
          <Button variant="primary" className="h-9" disabled={pending}>
            {pending ? "One moment…" : `Join ${agencyName}`}
          </Button>
        </form>
      )}
    </div>
  );
}
