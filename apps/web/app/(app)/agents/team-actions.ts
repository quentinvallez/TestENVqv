"use server";
import { getT } from "@/lib/i18n/server";

import { runTool, tools } from "@viewing/core";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getToolContext, requireAdmin } from "@/lib/context";

export type InviteState = { error?: string; sent?: boolean } | undefined;

const refresh = (agentId: string) => {
  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
};

/** Invite (or invite again) an agent to log in: Better Auth stores the invitation and we email the link. */
export async function inviteAgentAction(agentId: string, _state: InviteState): Promise<InviteState> {
  const t = await getT();
  try {
    const { agency } = await requireAdmin();
    const { email, login } = await runTool(tools.getAgentLogin, await getToolContext(), { agentId });
    if (!email) return { error: t("Add the agent's email address first.") };
    if (login.status === "member") return { error: t("This agent can already log in.") };
    await auth.api.createInvitation({ headers: await headers(), body: { email, role: "member", organizationId: agency.id } });
    refresh(agentId);
    return { sent: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : t("Inviting failed.") };
  }
}

export async function cancelInvitationAction(agentId: string, invitationId: string) {
  await requireAdmin();
  await auth.api.cancelInvitation({ headers: await headers(), body: { invitationId } });
  refresh(agentId);
}

/** Admins change settings and invite colleagues; agents run their own day. The owner stays as is. */
export async function setLoginRoleAction(agentId: string, memberId: string, role: "admin" | "member") {
  const { agency } = await requireAdmin();
  await auth.api.updateMemberRole({ headers: await headers(), body: { memberId, role, organizationId: agency.id } });
  refresh(agentId);
}

/** Takes away the agent's login; the agent, their listings and viewings stay. */
export async function removeLoginAction(agentId: string, memberId: string) {
  const { agency } = await requireAdmin();
  await auth.api.removeMember({ headers: await headers(), body: { memberIdOrEmail: memberId, organizationId: agency.id } });
  await runTool(tools.unlinkAgentLogin, await getToolContext(), { agentId });
  refresh(agentId);
}
