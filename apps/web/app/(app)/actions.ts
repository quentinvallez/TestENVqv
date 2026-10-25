"use server";

import { leadStages, runTool, tools } from "@viewing/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getToolContext } from "@/lib/context";

export async function seedDemoAction() {
  await runTool(tools.seedDemoData, await getToolContext(), {});
  revalidatePath("/", "layout");
}

export async function moveLeadStageAction(leadId: string, stage: (typeof leadStages)[number]) {
  await runTool(tools.moveLeadStage, await getToolContext(), { leadId, stage });
  revalidatePath("/leads");
}

export async function decideProposalAction(proposalId: string, decision: "approved" | "rejected") {
  await runTool(tools.decideProposal, await getToolContext(), { proposalId, decision });
  revalidatePath("/", "layout");
}

export type AvailabilityState = { saved?: boolean; error?: string } | undefined;

export async function saveAvailabilityAction(agentId: string, _state: AvailabilityState, form: FormData): Promise<AvailabilityState> {
  const toMinutes = (value: FormDataEntryValue | null) => {
    const [h, m] = String(value ?? "").split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const workingHours = [0, 1, 2, 3, 4, 5, 6]
    .filter((day) => form.get(`on-${day}`) === "on")
    .map((weekday) => ({ weekday, startMinute: toMinutes(form.get(`start-${weekday}`)), endMinute: toMinutes(form.get(`end-${weekday}`)) }));
  if (workingHours.some((w) => w.endMinute <= w.startMinute)) return { error: "End times must be after start times." };
  try {
    await runTool(tools.setAgentAvailability, await getToolContext(), {
      agentId,
      workingHours,
      slotMinutes: Number(form.get("slotMinutes")),
      bufferMinutes: Number(form.get("bufferMinutes")),
    });
  } catch {
    return { error: "Could not save. Please check the times." };
  }
  revalidatePath("/agents", "layout");
  return { saved: true };
}

export async function cancelAppointmentAction(appointmentId: string) {
  await runTool(tools.cancelAppointment, await getToolContext(), { appointmentId, reason: "Cancelled by the agency" });
  revalidatePath("/", "layout");
}

export async function draftFollowUpAction(appointmentId: string) {
  const { conversationId } = await runTool(tools.plannerFollowUp, await getToolContext(), { appointmentId });
  revalidatePath("/", "layout");
  redirect(`/inbox?c=${conversationId}`);
}

export type AssignState = { saved?: string; error?: string } | undefined;

export async function assignAgentAction(listingId: string, _state: AssignState, form: FormData): Promise<AssignState> {
  try {
    const result = await runTool(tools.assignListingAgent, await getToolContext(), { listingId, agentId: String(form.get("agentId") ?? "") });
    revalidatePath("/", "layout");
    if (!result.changed) return { saved: "No change" };
    return { saved: result.leadsMoved ? `Saved · ${result.leadsMoved} open ${result.leadsMoved === 1 ? "lead" : "leads"} moved` : "Saved" };
  } catch {
    return { error: "Could not change the agent" };
  }
}

export async function suggestListingsAction(contactId: string) {
  const { conversationId } = await runTool(tools.suggestListings, await getToolContext(), { contactId });
  revalidatePath("/", "layout");
  redirect(conversationId ? `/inbox?c=${conversationId}` : `/contacts/${contactId}`);
}

export async function suggestToMatchesAction(listingId: string) {
  await runTool(tools.suggestListingToMatches, await getToolContext(), { listingId });
  revalidatePath("/", "layout");
  redirect("/inbox?f=drafts");
}

export async function setValuationLauncherAction(on: boolean) {
  await runTool(tools.updateWidgetSettings, await getToolContext(), { valuationLauncher: on });
  revalidatePath("/widget");
}

export async function disconnectCalendarAction(agentId: string, connectionId: string) {
  await runTool(tools.disconnectCalendar, await getToolContext(), { connectionId });
  revalidatePath(`/agents/${agentId}`);
}

export type WhatsAppState = { error?: string; saved?: boolean } | undefined;

export async function connectWhatsAppAction(_state: WhatsAppState, form: FormData): Promise<WhatsAppState> {
  try {
    await runTool(tools.connectWhatsApp, await getToolContext(), {
      phoneNumberId: String(form.get("phoneNumberId") ?? ""),
      displayNumber: String(form.get("displayNumber") ?? ""),
      accessToken: String(form.get("accessToken") ?? ""),
    });
  } catch (error) {
    return { error: error instanceof Error && !error.message.startsWith("[") ? error.message : "Check the phone number id, number and token." };
  }
  revalidatePath("/settings");
  return { saved: true };
}

export async function disconnectWhatsAppAction() {
  await runTool(tools.connectWhatsApp, await getToolContext(), { disconnect: true });
  revalidatePath("/settings");
}
export async function updateAutomationsAction(change: {
  reminders?: boolean;
  followUps?: boolean;
  noShows?: boolean;
  nudges?: boolean;
  nudgeAfterDays?: number;
  sendRemindersAutomatically?: boolean;
}) {
  await runTool(tools.updateAutomationSettings, await getToolContext(), change);
  revalidatePath("/settings");
}

export async function setNudgeDaysAction(form: FormData) {
  await runTool(tools.updateAutomationSettings, await getToolContext(), { nudgeAfterDays: Number(form.get("nudgeAfterDays")) });
  revalidatePath("/settings");
}

export async function runAutomationsAction() {
  await runTool(tools.runAutomationsNow, await getToolContext(), {});
  revalidatePath("/", "layout");
}

export async function markAttendanceAction(appointmentId: string, attended: boolean) {
  const { conversationId } = await runTool(tools.markAttendance, await getToolContext(), { appointmentId, attended });
  revalidatePath("/", "layout");
  if (conversationId) redirect(`/inbox?c=${conversationId}`);
}
