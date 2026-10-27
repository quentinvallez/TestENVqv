"use server";

import { runTool, tools } from "@viewing/core";
import { occupantAgency, publicContext } from "@viewing/core/public";
import { revalidatePath } from "next/cache";

export type OccupantFormState = { saved?: boolean; conflicts?: number; error?: boolean } | undefined;

const toMinutes = (value: FormDataEntryValue | null) => {
  const [h, m] = String(value ?? "").split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The owner or tenant saves the weekly times their home can be visited, the days they're away and their notice. */
export async function saveOccupantAvailabilityAction(token: string, _state: OccupantFormState, form: FormData): Promise<OccupantFormState> {
  const found = await occupantAgency(token);
  if (!found) return { error: true };
  const windows = [0, 1, 2, 3, 4, 5, 6]
    .filter((day) => form.get(`on-${day}`) === "on")
    .map((weekday) => ({ weekday, startMinute: toMinutes(form.get(`start-${weekday}`)), endMinute: toMinutes(form.get(`end-${weekday}`)) }));
  const from = form.getAll("away-from").map(String);
  const to = form.getAll("away-to").map(String);
  const away = from.map((f, i) => ({ from: f, to: to[i] || f })).filter((a) => a.from);
  const notice = Number(form.get("notice"));
  try {
    const result = await runTool(tools.setOccupantAvailability, publicContext(found.agencyId), { token, windows, away, viewingNoticeHours: notice > 0 ? notice : null });
    revalidatePath(`/s/${token}`);
    return { saved: true, conflicts: result.conflicts };
  } catch (error) {
    console.error(error);
    return { error: true };
  }
}

export type ProblemState = { sent?: boolean; error?: boolean } | undefined;

/** "I can't make this time": the agent gets an urgent draft; the viewing stays until the visitor moves it. */
export async function reportProblemAction(token: string, appointmentId: string, _state: ProblemState, form: FormData): Promise<ProblemState> {
  const found = await occupantAgency(token);
  if (!found) return { error: true };
  try {
    await runTool(tools.reportOccupantProblem, publicContext(found.agencyId), { token, appointmentId, note: String(form.get("note") ?? "").trim() || undefined });
    return { sent: true };
  } catch (error) {
    console.error(error);
    return { error: true };
  }
}
