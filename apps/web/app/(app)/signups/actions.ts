"use server";
import { getT } from "@/lib/i18n/server";

import { runTool, SignupError, tools } from "@viewing/core";
import { platformAgencyId } from "@viewing/core/public";
import { revalidatePath } from "next/cache";
import { getToolContext, requireAdmin } from "@/lib/context";

export type DecisionState = { message?: string; link?: string; error?: string } | undefined;

/** Only admins of our own agency in the platform decide on workspace requests. */
async function deciderContext() {
  const { agency } = await requireAdmin();
  if (agency.id !== platformAgencyId()) throw new Error("Only the platform team decides on workspace requests.");
  return getToolContext();
}

export async function approveSignupAction(requestId: string, _: DecisionState): Promise<DecisionState> {
  const t = await getT();
  try {
    const sent = await runTool(tools.approveSignup, await deciderContext(), { requestId });
    revalidatePath("/signups");
    return sent.delivery === "sent"
      ? { message: t("Approved. The link is on its way.") }
      : { message: t("Approved, but the email wasn't sent. Send them this link yourself:"), link: sent.link };
  } catch (error) {
    if (error instanceof SignupError) return { error: error.message };
    throw error;
  }
}

export async function declineSignupAction(requestId: string) {
  await runTool(tools.declineSignup, await deciderContext(), { requestId });
  revalidatePath("/signups");
}
