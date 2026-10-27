import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingWidget } from "@/components/booking/widget";
import { loadWidget } from "@/lib/widget-data";
import { toWidgetLang } from "@/lib/widget-i18n";
import { bookFromWidgetAction } from "../../../(public)/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a viewing", robots: { index: false } };

/**
 * The widget as it runs inside an agency's website (in an iframe). The embed
 * script of Phase 2 loads exactly this page.
 */
export default async function EmbedPage({ params, searchParams }: { params: Promise<{ listingId: string }>; searchParams: Promise<{ lang?: string; agent?: string }> }) {
  const { listingId } = await params;
  const query = await searchParams;
  const lang = toWidgetLang(query.lang);
  // The agent named on the agency's page, as detected by widget.js; ignored if not an active agent of this agency.
  const widget = await loadWidget(listingId, lang, query.agent);
  if (!widget) notFound();
  const brand = widget.branding?.primaryColor;

  return (
    <div style={{ "--brand": brand ?? "var(--primary)", "--brand-fg": brand ? "#ffffff" : "var(--primary-fg)" } as React.CSSProperties}>
      <BookingWidget
        lang={lang}
        days={widget.days}
        questions={widget.questions}
        agentName={widget.agent.name}
        slotMinutes={widget.slotMinutes}
        awaitingOccupant={widget.awaitingOccupant}
        occupied={widget.listing.access !== "agent"}
        agencyName={widget.agencyName}
        action={bookFromWidgetAction.bind(null, listingId, lang, widget.agent.id)}
      />
    </div>
  );
}
