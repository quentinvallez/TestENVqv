import "server-only";
import { and, db, eq, schema } from "@viewing/db";
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
  const [membership] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.userId, session.user.id), eq(schema.member.organizationId, agency.id)));
  if (!membership) redirect("/onboarding");
  const role = membership.role as "owner" | "admin" | "member";
  return { user: session.user, agency, role, isAdmin: role === "owner" || role === "admin" };
});

/** For actions only the agency's owner and admins may take: settings and logins. */
export async function requireAdmin() {
  const session = await getSession();
  if (!session.isAdmin) throw new Error("Only admins can change this.");
  return session;
}

/** Tool context for the signed-in user, scoped to their agency. */
export async function getToolContext(): Promise<ToolContext> {
  const { user, agency } = await getSession();
  return { db, agencyId: agency.id, actor: { type: "user", id: user.id } };
}
