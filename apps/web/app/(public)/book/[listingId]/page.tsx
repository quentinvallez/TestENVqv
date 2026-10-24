import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { BookingShell } from "@/components/booking/shell";
import { BookingWidget } from "@/components/booking/widget";
import { ListingPhoto } from "@/components/listing-photo";
import { address, formatPrice } from "@/lib/format";
import { loadWidget } from "@/lib/widget-data";
import { toWidgetLang, widgetText } from "@/lib/widget-i18n";
import { bookFromWidgetAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a viewing", robots: { index: false } };

export default async function BookPage({ params, searchParams }: { params: Promise<{ listingId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { listingId } = await params;
  const lang = toWidgetLang((await searchParams).lang);
  const widget = await loadWidget(listingId, lang);
  if (!widget) notFound();
  const { listing, agencyName, branding } = widget;

  return (
    <BookingShell agencyName={agencyName} branding={branding}>
      <div className="flex gap-4 border-b border-line p-5">
        <ListingPhoto src={listing.photos[0]?.url} alt={listing.title ?? listing.reference} className="size-20 shrink-0 rounded-lg border border-line" />
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold tracking-tight">{widgetText[lang].title}</h1>
          <p className="mt-0.5 flex items-center gap-1 truncate text-muted">
            <MapPin className="size-3.5 shrink-0" />
            {address(listing.street, listing.houseNumber, listing.city)}
          </p>
          <p className="mt-1 text-[12px] font-medium">{formatPrice(listing.price, listing.transaction)}</p>
        </div>
      </div>
      <div className="p-5">
        <BookingWidget
          lang={lang}
          days={widget.days}
          questions={widget.questions}
          agentName={widget.agent.name}
          slotMinutes={widget.slotMinutes}
          agencyName={agencyName}
          action={bookFromWidgetAction.bind(null, listing.id, lang, widget.agent.id)}
        />
      </div>
    </BookingShell>
  );
}
