"use server";

import { formatSlot, runTool, SlotUnavailableError, tools } from "@viewing/core";
import { appointmentByManageToken, bookableListing, publicContext } from "@viewing/core/public";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { toWidgetLang } from "@/lib/widget-i18n";

export type FormState = { error?: string } | undefined;
export type WidgetState = { error?: string; booked?: { when: string; manageUrl: string }; requested?: boolean } | undefined;

function errorMessage(error: unknown) {
  if (error instanceof SlotUnavailableError) return error.message;
  if (error instanceof z.ZodError) return "Please check your details and try again.";
  console.error(error);
  return "Something went wrong. Please try again.";
}

export async function cancelByTokenAction(token: string) {
  const found = await appointmentByManageToken(token);
  if (!found) return;
  await runTool(tools.cancelAppointment, publicContext(found.appointment.agencyId), {
    appointmentId: found.appointment.id,
    reason: "Cancelled by the client",
    reopenLead: true,
  });
  redirect(`/a/${token}`);
}

export async function rescheduleByTokenAction(token: string, _state: FormState, form: FormData): Promise<FormState> {
  const startsAt = String(form.get("startsAt") ?? "");
  if (!startsAt) return { error: "Choose a new time first." };
  const found = await appointmentByManageToken(token);
  if (!found) return { error: "This booking could not be found." };
  try {
    await runTool(tools.rescheduleAppointment, publicContext(found.appointment.agencyId), { appointmentId: found.appointment.id, startsAt });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  redirect(`/a/${token}?moved=1`);
}

const widgetErrors = {
  nl: { slot: "Dit moment is net ingenomen. Kies een ander moment.", details: "Controleer uw gegevens.", generic: "Er ging iets mis. Probeer opnieuw.", gone: "Dit pand kan niet meer geboekt worden." },
  fr: { slot: "Ce moment vient d'être pris. Choisissez-en un autre.", details: "Vérifiez vos coordonnées.", generic: "Une erreur s'est produite. Réessayez.", gone: "Ce bien ne peut plus être réservé." },
  en: { slot: "This time was just taken. Please choose another.", details: "Please check your details.", generic: "Something went wrong. Please try again.", gone: "This property can no longer be booked." },
};

/** Booking from the widget: stays on the page (it may be inside an iframe) and returns the confirmation. */
export async function bookFromWidgetAction(listingId: string, langValue: string, agentId: string, _state: WidgetState, form: FormData): Promise<WidgetState> {
  const lang = toWidgetLang(langValue);
  const errors = widgetErrors[lang];
  if (form.get("website")) return { error: errors.generic };
  const found = await bookableListing(listingId);
  if (!found) return { error: errors.gone };

  const qualification: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("q-") && typeof value === "string" && value) qualification[key.slice(2)] = value;
  }
  const contact = {
    firstName: String(form.get("firstName") ?? ""),
    lastName: String(form.get("lastName") ?? "") || undefined,
    email: String(form.get("email") ?? ""),
    phone: String(form.get("phone") ?? "") || undefined,
    language: lang,
    whatsappOptIn: form.get("whatsapp") === "on",
  };
  // No free time to pick (e.g. the owner hasn't given any yet): the visitor asks for a viewing instead.
  if (form.get("request") && !form.get("startsAt")) {
    try {
      await runTool(tools.requestViewing, publicContext(found.listing.agencyId), { listingId, contact, message: String(form.get("message") ?? "") || undefined });
      return { requested: true };
    } catch (error) {
      if (error instanceof z.ZodError) return { error: errors.details };
      console.error(error);
      return { error: errors.generic };
    }
  }
  try {
    const result = await runTool(tools.bookViewing, publicContext(found.listing.agencyId), {
      listingId,
      agentId,
      startsAt: String(form.get("startsAt") ?? ""),
      source: "website",
      message: String(form.get("message") ?? "") || undefined,
      qualification,
      contact,
    });
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    return { booked: { when: formatSlot(result.startsAt, lang), manageUrl: `${origin}/a/${result.manageToken}` } };
  } catch (error) {
    if (error instanceof SlotUnavailableError) return { error: errors.slot };
    if (error instanceof z.ZodError) return { error: errors.details };
    console.error(error);
    return { error: errors.generic };
  }
}
