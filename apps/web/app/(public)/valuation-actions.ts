"use server";

import { runTool, tools } from "@viewing/core";
import { publicContext, publicAgency, valuationAgency } from "@viewing/core/public";
import { z } from "zod";
import { toWidgetLang } from "@/lib/widget-i18n";
import { valuationText } from "@/lib/valuation-i18n";

export type ValuationRequestState =
  | { error?: string; token?: undefined }
  | { token: string; whatsappLink: string | null; demoCode: string | null; error?: string };

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? undefined : Number(v));

export async function requestValuationAction(agencyId: string, langValue: string, _state: ValuationRequestState | undefined, form: FormData): Promise<ValuationRequestState> {
  const lang = toWidgetLang(langValue);
  if (form.get("website")) return { error: valuationText[lang].error };
  const agency = await publicAgency(agencyId);
  if (!agency || form.get("consent") !== "on") return { error: valuationText[lang].error };
  try {
    const result = await runTool(tools.requestValuation, publicContext(agencyId), {
      street: String(form.get("street") ?? ""),
      houseNumber: String(form.get("houseNumber") ?? "") || undefined,
      postcode: String(form.get("postcode") ?? ""),
      city: String(form.get("city") ?? ""),
      firstName: String(form.get("firstName") ?? ""),
      email: String(form.get("email") ?? "") || undefined,
      phone: String(form.get("phone") ?? ""),
      language: lang,
      consent: true,
      answers: {
        propertyType: String(form.get("propertyType")) as "house",
        livingArea: num(form.get("livingArea")) as number,
        plotArea: num(form.get("plotArea")),
        bedrooms: num(form.get("bedrooms")) ?? 0,
        bathrooms: num(form.get("bathrooms")) ?? 1,
        yearBuilt: num(form.get("yearBuilt")),
        condition: String(form.get("condition") || "good") as "good",
        epcLabel: (String(form.get("epcLabel") ?? "") || undefined) as "C" | undefined,
        kitchen: (String(form.get("kitchen") ?? "") || undefined) as "standard" | undefined,
        extras: form.getAll("extras").map(String) as ("garage" | "garden")[],
        plans: (String(form.get("plans") ?? "") || undefined) as "curious" | undefined,
      },
    });
    return { token: result.token, whatsappLink: result.whatsappLink, demoCode: result.demoCode };
  } catch (error) {
    if (!(error instanceof z.ZodError)) console.error(error);
    return { error: valuationText[lang].error };
  }
}

export type VerifyState = { error?: string; verified?: boolean; low?: number; high?: number; confidence?: string; hasEstimate?: boolean } | undefined;

export async function verifyValuationAction(langValue: string, token: string, _state: VerifyState, form: FormData): Promise<VerifyState> {
  const lang = toWidgetLang(langValue);
  const agency = await valuationAgency(token);
  if (!agency) return { error: valuationText[lang].error };
  const result = await runTool(tools.verifyValuation, publicContext(agency.agencyId), { token, code: String(form.get("code") ?? "") });
  if (!result.verified) return { error: valuationText[lang].wrongCode };
  return result.result
    ? { verified: true, hasEstimate: true, low: result.result.low, high: result.result.high, confidence: result.result.confidence }
    : { verified: true, hasEstimate: false };
}

export type VisitState = { error?: string; booked?: string } | undefined;

export async function bookVisitAction(token: string, langValue: string, _state: VisitState, form: FormData): Promise<VisitState> {
  const lang = toWidgetLang(langValue);
  const agency = await valuationAgency(token);
  const startsAt = String(form.get("startsAt") ?? "");
  if (!agency || !startsAt) return { error: valuationText[lang].error };
  try {
    const { formatSlot } = await import("@viewing/core");
    const visit = await runTool(tools.bookValuationVisit, publicContext(agency.agencyId), { valuationToken: token, startsAt });
    return { booked: formatSlot(visit.startsAt, lang) };
  } catch {
    return { error: valuationText[lang].error };
  }
}
