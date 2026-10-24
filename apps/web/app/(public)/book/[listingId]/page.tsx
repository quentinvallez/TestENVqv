import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { runTool, tools } from "@viewing/core";
import { bookableListing, publicContext } from "@viewing/core/public";
import { CalendarDays, MapPin } from "lucide-react";
import { BookingForm } from "@/components/booking/booking-form";
import { BookingShell } from "@/components/booking/shell";
import { ListingPhoto } from "@/components/listing-photo";
import { address, formatPrice } from "@/lib/format";
import { groupSlotsByDay } from "@/lib/slots";
import { bookViewingAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a viewing", robots: { index: false } };

export default async function BookPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const found = await bookableListing(listingId);
  if (!found) notFound();
  const { listing, agencyName, branding } = found;
  const { agent, slotMinutes, slots } = await runTool(tools.availableSlots, publicContext(listing.agencyId), { listingId, days: 14 });

  return (
    <BookingShell agencyName={agencyName} branding={branding}>
      <div className="flex gap-4 border-b border-line p-5">
        <ListingPhoto src={listing.photos[0]?.url} alt={listing.title ?? listing.reference} className="size-20 shrink-0 rounded-lg border border-line" />
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold tracking-tight">Book a viewing</h1>
          <p className="mt-0.5 flex items-center gap-1 truncate text-muted">
            <MapPin className="size-3.5 shrink-0" />
            {address(listing.street, listing.houseNumber, listing.city)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-muted">
            <span className="font-medium text-fg">{formatPrice(listing.price, listing.transaction)}</span>
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {slotMinutes} min with {agent.name}
            </span>
          </p>
        </div>
      </div>
      <div className="p-5">
        <BookingForm days={groupSlotsByDay(slots)} action={bookViewingAction.bind(null, listing.id)} />
      </div>
    </BookingShell>
  );
}
