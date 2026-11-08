"use server";

import { leadStages, PreviewError, runTool, tools } from "@viewing/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getToolContext } from "@/lib/context";

export async function seedDemoAction() {
  await runTool(tools.seedDemoData, await getToolContext(), {});
  revalidatePath("/", "layout");
}

export async function resetDemoAction() {
  await runTool(tools.resetToDemoData, await getToolContext(), {});
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

export type AgentFormState = { error?: string; saved?: boolean } | undefined;

/** Adds an agent, or changes one when the form carries an agentId. Empty fields clear email and phone. */
export async function saveAgentAction(_state: AgentFormState, form: FormData): Promise<AgentFormState> {
  const text = (key: string) => (form.has(key) ? String(form.get(key) ?? "").trim() : undefined);
  const agentId = text("agentId");
  const name = text("name");
  const email = text("email");
  const phone = text("phone");
  try {
    const ctx = await getToolContext();
    if (agentId) {
      await runTool(tools.updateAgent, ctx, { agentId, ...(name && { name }), ...(email !== undefined && { email: email || null }), ...(phone !== undefined && { phone: phone || null }) });
      revalidatePath(`/agents/${agentId}`);
    } else {
      await runTool(tools.createAgent, ctx, { name: name ?? "", email: email || null, phone: phone || null });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { error: message.startsWith("[") ? "Check the name and email address." : message || "Saving failed." };
  }
  revalidatePath("/agents");
  return { saved: true };
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
  sendFollowUpsAutomatically?: boolean;
  sendNoShowsAutomatically?: boolean;
  sendNudgesAutomatically?: boolean;
  sendOccupantAlertsAutomatically?: boolean;
  agentAlerts?: boolean;
  portalLeadCopies?: boolean;
  replyToPortalLeadsAutomatically?: boolean;
  sendBookingConfirmationsAutomatically?: boolean;
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

export type WebsiteImportState =
  | { error?: string; read?: number; pages?: number; remaining?: number; checked?: number; created?: number; updated?: number; searching?: boolean }
  | undefined;

export async function importWebsiteAction(_state: WebsiteImportState, form: FormData): Promise<WebsiteImportState> {
  const websiteUrl = String(form.get("websiteUrl") ?? "").trim();
  try {
    // Stays under the page's time limit; the page starts the next run while pages are left.
    const summary = await runTool(tools.importWebsiteListings, await getToolContext(), { websiteUrl: websiteUrl || undefined, budgetSeconds: 50 });
    revalidatePath("/listings", "layout");
    return {
      read: summary.found ?? 0,
      pages: summary.pages ?? 0,
      remaining: summary.remaining ?? 0,
      checked: summary.checked,
      created: summary.created ?? 0,
      updated: summary.updated ?? 0,
      searching: summary.searching,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The website could not be read." };
  }
}

/**
 * Setup step 1: the agency's website. The first time (or for a new address) its home page is read for the brand
 * colour and the system it's built with; then the listings are imported, run after run, like on the import screen.
 */
export async function setupWebsiteAction(state: WebsiteImportState, form: FormData): Promise<WebsiteImportState> {
  const websiteUrl = String(form.get("websiteUrl") ?? "").trim();
  const ctx = await getToolContext();
  const current = await runTool(tools.getWidgetSettings, ctx, {});
  const host = (url: string) => {
    try {
      return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host.replace(/^www\./, "");
    } catch {
      return null;
    }
  };
  if (websiteUrl && (host(websiteUrl) !== (current.websiteUrl && host(current.websiteUrl)) || (!current.brandColor && !current.siteBuilder))) {
    try {
      await runTool(tools.readWebsiteLook, ctx, { websiteUrl });
    } catch (error) {
      // The import says the same in its own words when the site can't be read.
      console.error("Reading the website's look failed", error);
    }
    revalidatePath("/widget");
  }
  return importWebsiteAction(state, form);
}

export type MissingListingState = { message?: string; listingId?: string | null; error?: string } | undefined;

/** A listing the agency sees on its site but not here: read that page now. */
export async function importMissingListingAction(_state: MissingListingState, form: FormData): Promise<MissingListingState> {
  const url = String(form.get("url") ?? "").trim();
  try {
    const result = await runTool(tools.importWebsitePage, await getToolContext(), { url, force: true });
    revalidatePath("/listings", "layout");
    if (result.status === "skipped") return { error: "That page isn't on your website's address. Paste the link as it appears in the browser." };
    if (result.status === "blocked") return { error: "Your website's robots.txt doesn't let us read that page." };
    if (result.status === "failed") return { error: "The page could not be read. Check the link and try again." };
    if (result.status === "other" || result.status === "removed") return { error: "We read the page, but it doesn't look like a listing that is on offer." };
    return { message: result.status === "created" ? "Added. We noted that our search missed it, so the search gets better." : "We had it already; it is up to date now.", listingId: result.listingId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The page could not be read." };
  }
}

export async function setBookingLauncherAction(on: boolean) {
  await runTool(tools.updateWidgetSettings, await getToolContext(), { bookingLauncher: on });
  revalidatePath("/widget");
}

export async function setListingAccessAction(listingId: string, form: FormData) {
  const notice = Number(form.get("notice"));
  await runTool(tools.setListingAccess, await getToolContext(), {
    listingId,
    access: String(form.get("access")) as "agent" | "owner" | "tenant",
    viewingNoticeHours: notice > 0 ? notice : null,
  });
  revalidatePath(`/listings/${listingId}`);
}

export type OccupantState = { added?: boolean; error?: string } | undefined;

export async function addOccupantAction(listingId: string, _state: OccupantState, form: FormData): Promise<OccupantState> {
  const text = (key: string) => String(form.get(key) ?? "").trim() || undefined;
  try {
    await runTool(tools.addListingOccupant, await getToolContext(), {
      listingId,
      role: form.get("role") === "tenant" ? "tenant" : "owner",
      contact: {
        firstName: text("firstName") ?? "",
        lastName: text("lastName"),
        email: text("email"),
        phone: text("phone"),
        language: (text("language") as "nl" | "fr" | "en" | undefined) ?? undefined,
        whatsappOptIn: form.get("whatsapp") === "on",
      },
    });
  } catch {
    return { error: "Add a first name and an email address or phone number." };
  }
  revalidatePath("/", "layout");
  return { added: true };
}

export async function updateOccupantAction(listingId: string, occupantId: string, change: { alerts?: boolean; newLink?: boolean; remove?: boolean }) {
  await runTool(tools.updateListingOccupant, await getToolContext(), { occupantId, ...change });
  revalidatePath(`/listings/${listingId}`);
}

export type PreviewState = { token?: string; error?: string } | undefined;

/** A preview of our widget on a prospect agency's own listings, for sales. */
export async function createPreviewAction(_state: PreviewState, form: FormData): Promise<PreviewState> {
  const website = String(form.get("website") ?? "").trim();
  if (!website) return { error: "Enter the agency's website." };
  try {
    const preview = await runTool(tools.createWidgetPreview, await getToolContext(), { website });
    revalidatePath("/previews");
    return { token: preview.token };
  } catch (error) {
    if (error instanceof PreviewError) return { error: error.message };
    console.error("The preview failed", error);
    return { error: "The website could not be read. Check the address and try again." };
  }
}

export async function deletePreviewAction(previewId: string) {
  await runTool(tools.deleteWidgetPreview, await getToolContext(), { previewId });
  revalidatePath("/previews");
}

export type ForwardingState = { error?: string; done?: boolean } | undefined;

/** One click in Settings → Portal leads: the rule in the agent's Outlook, created or removed. */
export async function portalForwardingAction(agentId: string, remove: boolean, _state: ForwardingState): Promise<ForwardingState> {
  try {
    const ctx = await getToolContext();
    if (remove) await runTool(tools.removePortalForwarding, ctx, { agentId });
    else await runTool(tools.setupPortalForwarding, ctx, { agentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { error: /^(Connect|The inbox)/.test(message) ? message : "Outlook refused the rule. Try again, or connect Outlook again." };
  }
  revalidatePath("/settings");
  return { done: true };
}

export async function leadCopyAddressAction(_state: ForwardingState, form: FormData): Promise<ForwardingState> {
  try {
    await runTool(tools.setLeadCopyAddress, await getToolContext(), { address: String(form.get("address") ?? "") });
  } catch {
    return { error: "That doesn't look like an email address." };
  }
  revalidatePath("/settings");
  return { done: true };
}
