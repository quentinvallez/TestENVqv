import Link from "next/link";
import { headers } from "next/headers";
import { invitationForLink } from "@viewing/core/public";
import { auth } from "@/lib/auth";
import { AcceptInvitation } from "./accept";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const ended = {
  accepted: msg("This invitation was already accepted. Log in with your email and password."),
  rejected: msg("This invitation was declined."),
  canceled: msg("This invitation was cancelled. Ask your office to send a new one."),
  expired: msg("This invitation has expired. Ask your office to send a new one."),
} as const;

/** The page an invited agent opens from their email: set a password (or log in) and join the agency. */
export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const invitation = await invitationForLink(id);
  if (!invitation || invitation.state !== "pending") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[20px] font-semibold tracking-tight">{t("Invitation")}</h1>
        <p className="text-muted">{invitation && invitation.state !== "pending" ? t(ended[invitation.state]) : t("This link doesn't work. Ask your office to send a new invitation.")}</p>
        <Link href="/login" className="text-fg underline-offset-2 hover:underline">
          {t("Go to login")}
        </Link>
      </div>
    );
  }
  const session = await auth.api.getSession({ headers: await headers() });
  const signedInAs = session?.user.email ?? null;
  return (
    <AcceptInvitation
      invitationId={invitation.id}
      agencyId={invitation.agencyId}
      agencyName={invitation.agencyName}
      email={invitation.email}
      name={invitation.agentName ?? ""}
      agentId={invitation.agentId}
      hasAccount={invitation.hasAccount}
      signedInAs={signedInAs}
    />
  );
}
