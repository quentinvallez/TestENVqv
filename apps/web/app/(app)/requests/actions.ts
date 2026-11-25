"use server";
import { getT } from "@/lib/i18n/server";

import { runTool, tools } from "@viewing/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getToolContext } from "@/lib/context";

export type DraftState = { error?: string } | undefined;

export async function sendDraftAction(proposalId: string, _state: DraftState, form: FormData): Promise<DraftState> {
  const t = await getT();
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: t("The message is empty.") };
  const result = await runTool(tools.decideProposal, await getToolContext(), { proposalId, decision: "approved", edits: { body } });
  if (result.status === "failed") return { error: String(result.result?.error ?? t("Could not send")) };
  revalidatePath("/", "layout");
  return undefined;
}

export async function dismissDraftAction(proposalId: string) {
  await runTool(tools.decideProposal, await getToolContext(), { proposalId, decision: "rejected" });
  revalidatePath("/", "layout");
}

export async function redraftAction(conversationId: string) {
  await runTool(tools.plannerRedraft, await getToolContext(), { conversationId });
  revalidatePath("/requests", "layout");
}

/** The agent settled a request by hand: called or emailed them ("handled"), closed it, or opened it again. */
export async function markRequestAction(id: string, action: "handled" | "not_interested" | "reopen") {
  await runTool(tools.markRequest, await getToolContext(), { id, action });
  revalidatePath("/", "layout");
}

const portalSources = ["immoweb", "zimmo", "immovlan", "immoscoop", "website"] as const;

/** Demo helper: a request from a portal or the website's contact form, handled as the real ones are. */
export async function simulateMessageAction(_state: DraftState, form: FormData): Promise<DraftState> {
  const t = await getT();
  const provider = String(form.get("provider"));
  const contact = String(form.get("contact") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!contact || !body) return { error: t("Fill in who it's from and the message.") };
  let target: string;
  try {
    const portal = portalSources.find((p) => p === provider);
    if (!portal) return { error: t("Pick where the request comes from.") };
    const email = contact.includes("@");
    const result = await runTool(tools.receivePortalLead, await getToolContext(), {
      portal,
      name: String(form.get("name") ?? "").trim() || null,
      ...(email ? { email: contact } : { phone: contact }),
      message: body,
      listingId: String(form.get("listingId") ?? "") || undefined,
    });
    target = result.leadId;
  } catch (error) {
    return { error: error instanceof Error ? error.message : t("Could not process the request") };
  }
  revalidatePath("/", "layout");
  redirect(`/requests/${target}`);
}
