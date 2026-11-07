import { after } from "next/server";
import { notFound } from "next/navigation";
import { demoSlots, qualificationQuestions, runTool, tools } from "@viewing/core";
import { previewByToken, publicContext } from "@viewing/core/public";
import { groupSlotsByDay } from "@/lib/slots";
import { toWidgetLang } from "@/lib/widget-i18n";
import { demoBookingAction } from "../actions";
import { PreviewStage } from "./stage";

export const dynamic = "force-dynamic";

/**
 * Our booking widget on a prospect agency's own listings: their site (in a frame, or a picture of it when it keeps
 * itself out of frames) with the widget on top, on a page of ours. Booking here books nothing.
 */
export default async function PreviewPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string; own?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const preview = await previewByToken(token);
  if (!preview) notFound();
  const lang = toWidgetLang(query.lang ?? preview.language);
  // Openings from the back office ("own") aren't the prospect's.
  if (!query.own) {
    after(async () => {
      try {
        await runTool(tools.noteWidgetPreview, publicContext(preview.agencyId), { previewId: preview.id, kind: "view" });
      } catch (error) {
        console.error("Counting the preview failed", error);
      }
    });
  }
  const days = groupSlotsByDay(demoSlots(preview.id), lang);
  const questions = (transaction: "sale" | "rent") =>
    qualificationQuestions[transaction].map((q) => ({ id: q.id, question: q.question[lang], options: q.options.map((o) => ({ id: o.id, label: o.label[lang] })) }));

  return (
    <PreviewStage
      lang={lang}
      token={token}
      site={preview.site}
      name={preview.name ?? new URL(preview.site).hostname.replace(/^www\./, "")}
      brand={preview.brandColor}
      homeFramable={preview.homeFramable}
      listingFramable={preview.listingFramable}
      homeShot={Boolean(preview.homeShot)}
      listingShot={Boolean(preview.listingShot)}
      listings={preview.listings.map((l) => ({ ...l, questions: questions(l.transaction ?? "sale") }))}
      days={days}
      action={demoBookingAction.bind(null, token, lang)}
    />
  );
}
