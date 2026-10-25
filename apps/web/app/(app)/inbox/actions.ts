"use server";

import { runTool, tools } from "@viewing/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getToolContext } from "@/lib/context";

export type DraftState = { error?: string } | undefined;

export async function sendDraftAction(proposalId: string, _state: DraftState, form: FormData): Promise<DraftState> {
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "The message is empty." };
  const result = await runTool(tools.decideProposal, await getToolContext(), { proposalId, decision: "approved", edits: { body } });
  if (result.status === "failed") return { error: String(result.result?.error ?? "Could not send") };
  revalidatePath("/", "layout");
  return undefined;
}

export async function dismissDraftAction(proposalId: string) {
  await runTool(tools.decideProposal, await getToolContext(), { proposalId, decision: "rejected" });
  revalidatePath("/", "layout");
}

export async function redraftAction(conversationId: string) {
  await runTool(tools.plannerRedraft, await getToolContext(), { conversationId });
  revalidatePath("/inbox");
}

export async function replyAction(conversationId: string, _state: DraftState, form: FormData): Promise<DraftState> {
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "The message is empty." };
  await runTool(tools.replyToConversation, await getToolContext(), { conversationId, body });
  revalidatePath("/", "layout");
  return undefined;
}

export async function setStatusAction(conversationId: string, status: "open" | "done") {
  await runTool(tools.updateConversation, await getToolContext(), { conversationId, status });
  revalidatePath("/", "layout");
}

export async function simulateMessageAction(_state: DraftState, form: FormData): Promise<DraftState> {
  const provider = String(form.get("provider")) as "outlook" | "gmail" | "whatsapp_business" | "immoweb" | "zimmo";
  const contact = String(form.get("contact") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!contact || !body) return { error: "Fill in who it's from and the message." };
  const isWhatsApp = provider === "whatsapp_business";
  let conversationId: string;
  try {
    if (provider === "immoweb" || provider === "zimmo") {
      const email = contact.includes("@");
      const result = await runTool(tools.receivePortalLead, await getToolContext(), {
        portal: provider,
        name: String(form.get("name") ?? "").trim() || null,
        ...(email ? { email: contact } : { phone: contact }),
        message: body,
        listingId: String(form.get("listingId") ?? "") || undefined,
      });
      conversationId = result.conversationId;
    } else {
      const result = await runTool(tools.receiveMessage, await getToolContext(), {
        channel: isWhatsApp ? "whatsapp" : "email",
        provider: provider as "outlook" | "gmail" | "whatsapp_business",
        from: { name: String(form.get("name") ?? "").trim() || contact, ...(isWhatsApp ? { phone: contact } : { email: contact }) },
        subject: isWhatsApp ? undefined : String(form.get("subject") ?? "").trim() || undefined,
        body,
        listingId: String(form.get("listingId") ?? "") || undefined,
      });
      conversationId = result.conversationId;
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not process the message" };
  }
  revalidatePath("/", "layout");
  redirect(`/inbox?c=${conversationId}`);
}
