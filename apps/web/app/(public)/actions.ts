"use server";

import { runTool, SlotUnavailableError, tools } from "@viewing/core";
import { appointmentByManageToken, bookableListing, publicContext } from "@viewing/core/public";
import { redirect } from "next/navigation";
import { z } from "zod";

export type FormState = { error?: string } | undefined;

function errorMessage(error: unknown) {
  if (error instanceof SlotUnavailableError) return error.message;
  if (error instanceof z.ZodError) return "Please check your details and try again.";
  console.error(error);
  return "Something went wrong. Please try again.";
}

export async function bookViewingAction(listingId: string, _state: FormState, form: FormData): Promise<FormState> {
  // Bots fill every field, people never see this one.
  if (form.get("website")) return { error: "Something went wrong. Please try again." };
  const startsAt = String(form.get("startsAt") ?? "");
  if (!startsAt) return { error: "Choose a time first." };

  const found = await bookableListing(listingId);
  if (!found) return { error: "This property can no longer be booked." };

  let token: string;
  try {
    const result = await runTool(tools.bookViewing, publicContext(found.listing.agencyId), {
      listingId,
      startsAt,
      source: "website",
      message: String(form.get("message") ?? "") || undefined,
      contact: {
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? "") || undefined,
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? "") || undefined,
        whatsappOptIn: form.get("whatsapp") === "on",
      },
    });
    token = result.manageToken;
  } catch (error) {
    return { error: errorMessage(error) };
  }
  redirect(`/a/${token}?booked=1`);
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
