import Link from "next/link";
import { headers } from "next/headers";
import { signupByToken } from "@viewing/core/public";
import { auth } from "@/lib/auth";
import { dpaTerms } from "./actions";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

const ended = {
  used: "This workspace was already created. Log in with your email and password.",
  closed: "This link doesn't work any more. Ask us for a new one.",
  expired: "This link has expired. Ask us for a new one and we'll send it right away.",
} as const;

/** The page an approved agency opens from our email: set a password and create the workspace. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await signupByToken(token);
  if (!request || request.state !== "open") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[20px] font-semibold tracking-tight">Your workspace</h1>
        <p className="text-muted">{request && request.state !== "open" ? ended[request.state] : ended.closed}</p>
        <Link href="/login" className="text-fg underline-offset-2 hover:underline">
          Go to login
        </Link>
      </div>
    );
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <JoinForm
      token={token}
      agencyName={request.agencyName}
      email={request.email}
      name={request.name}
      hasAccount={request.hasAccount}
      signedInAs={session?.user.email ?? null}
      dpa={await dpaTerms()}
    />
  );
}
