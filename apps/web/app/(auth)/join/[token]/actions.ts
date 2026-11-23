"use server";

import { db } from "@viewing/db";
import { runTool, SignupError, tools, type ToolContext } from "@viewing/core";
import { platformAgencyId } from "@viewing/core/public";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { dpaTerms } from "@/lib/legal";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export type CreateWorkspaceResult = { agencyId: string; website: string | null } | { error: string };

/**
 * Create the workspace of an approved request, for the login that just signed up (or in) with
 * the request's email. The request is taken first, so the link can't make a second workspace.
 */
export async function createWorkspaceAction(token: string, acceptedDpa: boolean): Promise<CreateWorkspaceResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Please set your password first." };
  const agencyId = platformAgencyId();
  if (!agencyId) return { error: "This link doesn't work any more. Ask us for a new one." };
  const dpa = dpaTerms();
  if (dpa && !acceptedDpa) return { error: "Please accept the data processing agreement." };
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: session.user.id } };

  let request;
  try {
    request = await runTool(tools.claimSignup, ctx, { token, email: session.user.email, dpaVersion: dpa?.version ?? null });
  } catch (error) {
    if (error instanceof SignupError) return { error: error.message };
    throw error;
  }
  try {
    // Without request headers this runs as the platform, the only way workspaces are made.
    const created = await auth.api.createOrganization({
      body: { name: request.agencyName, slug: `${slugify(request.agencyName) || "agency"}-${Math.random().toString(36).slice(2, 6)}`, userId: session.user.id },
    });
    if (!created) throw new Error("No workspace returned");
    await runTool(tools.finishSignup, ctx, { requestId: request.id, createdAgencyId: created.id });
    return { agencyId: created.id, website: request.website };
  } catch (error) {
    console.error("Creating the workspace failed", error);
    await runTool(tools.releaseSignup, ctx, { requestId: request.id });
    return { error: "We couldn't create the workspace. Please try again in a minute." };
  }
}
