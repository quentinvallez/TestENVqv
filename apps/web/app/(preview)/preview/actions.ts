"use server";

import { formatSlot, PreviewError, runTool, tools } from "@viewing/core";
import { redirect } from "next/navigation";
import { previewByToken, publicContext } from "@viewing/core/public";
import type { WidgetState } from "@/app/(public)/actions";
import { toWidgetLang } from "@/lib/widget-i18n";

const demoText = {
  nl: { pick: "Kies eerst een moment.", details: "Vul je voornaam en e-mail in.", gone: "Deze preview is verlopen." },
  fr: { pick: "Choisissez d'abord un moment.", details: "Indiquez votre prénom et votre e-mail.", gone: "Cet aperçu a expiré." },
  en: { pick: "Choose a time first.", details: "Please fill in your first name and email.", gone: "This preview has expired." },
};

/** Booking in a preview: checks the form like the real widget and shows the confirmation, but books and sends nothing. */
export async function demoBookingAction(token: string, langValue: string, _state: WidgetState, form: FormData): Promise<WidgetState> {
  const lang = toWidgetLang(langValue);
  const text = demoText[lang];
  const preview = await previewByToken(token);
  if (!preview) return { error: text.gone };
  const startsAt = String(form.get("startsAt") ?? "");
  if (!form.get("firstName") || !/^\S+@\S+\.\S+$/.test(String(form.get("email") ?? ""))) return { error: text.details };
  try {
    await runTool(tools.noteWidgetPreview, publicContext(preview.agencyId), { previewId: preview.id, kind: "demo_booking" });
  } catch (error) {
    console.error("Counting the demo booking failed", error);
  }
  if (form.get("request") && !startsAt) return { requested: true };
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return { error: text.pick };
  return { booked: { when: formatSlot(start, lang), manageUrl: `/preview/${token}?lang=${lang}` } };
}

export type PreviewRequestState = { error?: string } | undefined;

const requestText = {
  nl: { off: "Previews aanvragen kan hier nog niet.", details: "Vul de website van je kantoor en je e-mail in.", failed: "We konden de website niet lezen. Controleer het adres." },
  fr: { off: "Les aperçus ne peuvent pas encore être demandés ici.", details: "Indiquez le site de votre agence et votre e-mail.", failed: "Nous n'avons pas pu lire le site. Vérifiez l'adresse." },
  en: { off: "Previews can't be requested here yet.", details: "Enter your agency's website and your email.", failed: "We couldn't read the website. Check the address." },
};

/**
 * The public preview form: an agency enters its website and email and lands on its preview. Previews (and the emails)
 * belong to our own agency in the platform, set by PREVIEW_AGENCY_ID; without it the form is off.
 */
export async function requestPreviewAction(langValue: string, _state: PreviewRequestState, form: FormData): Promise<PreviewRequestState> {
  const lang = toWidgetLang(langValue);
  const text = requestText[lang];
  const agencyId = process.env.PREVIEW_AGENCY_ID;
  if (!agencyId) return { error: text.off };
  if (form.get("company")) return { error: text.details };
  const website = String(form.get("website") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  if (!website || !/^\S+@\S+\.\S+$/.test(email)) return { error: text.details };
  let token: string;
  try {
    const preview = await runTool(tools.createWidgetPreview, publicContext(agencyId), { website, email, source: "public" });
    token = preview.token;
  } catch (error) {
    if (error instanceof PreviewError) return { error: error.message };
    console.error("The public preview failed", error);
    return { error: text.failed };
  }
  redirect(`/preview/${token}?lang=${lang}`);
}
