"use server";
import { getT } from "@/lib/i18n/server";

import { runTool, SignupError, tools } from "@viewing/core";
import { platformAgencyId, publicContext } from "@viewing/core/public";
import { headers } from "next/headers";
import { ZodError } from "zod";

export type RequestAccessState = { done?: boolean; error?: string } | undefined;

/** The public "request access" form: the request waits for our approval on /signups. */
export async function requestAccessAction(_: RequestAccessState, form: FormData): Promise<RequestAccessState> {
  const t = await getT();
  const get = (key: string) => String(form.get(key) ?? "").trim();
  // A field people never see: only bots fill it in. They get the same answer and nothing is stored.
  if (get("company_url")) return { done: true };
  const agencyId = platformAgencyId();
  if (!agencyId) return { error: t("Requests are not open yet. Please email us instead.") };
  const language = (await headers()).get("accept-language")?.slice(0, 2).toLowerCase();
  try {
    await runTool(tools.requestSignup, publicContext(agencyId), {
      agencyName: get("agency"),
      website: get("website") || undefined,
      name: get("name"),
      email: get("email"),
      phone: get("phone") || undefined,
      note: get("note") || undefined,
      language,
    });
    return { done: true };
  } catch (error) {
    if (error instanceof SignupError) return { error: error.message };
    if (error instanceof ZodError) return { error: t("Please check your name, your agency's name and your email address.") };
    console.error("Workspace request failed", error);
    return { error: t("Something went wrong. Please try again.") };
  }
}
