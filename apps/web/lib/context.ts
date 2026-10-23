import "server-only";
import { db, eq, schema } from "@viewing/db";
import type { ToolContext } from "@viewing/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

/** The signed-in user and their active agency, or a redirect to login/onboarding. */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  let agencyId = session.session.activeOrganizationId;
  if (!agencyId) {
    const [membership] = await db
      .select({ organizationId: schema.member.organizationId })
      .from(schema.member)
      .where(eq(schema.member.userId, session.user.id))
      .limit(1);
    if (!membership) redirect("/onboarding");
    agencyId = membership.organizationId;
  }

  const agency = await db.query.organization.findFirst({ where: eq(schema.organization.id, agencyId) });
  if (!agency) redirect("/onboarding");
  return { user: session.user, agency };
});

/** Tool context for the signed-in user, scoped to their agency. */
export async function getToolContext(): Promise<ToolContext> {
  const { user, agency } = await getSession();
  return { db, agencyId: agency.id, actor: { type: "user", id: user.id } };
}
