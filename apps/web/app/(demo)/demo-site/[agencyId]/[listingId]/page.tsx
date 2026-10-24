import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { bookableListing } from "@viewing/core/public";
import { BedDouble, Bath, ChevronLeft, Leaf, Ruler, Trees } from "lucide-react";
import { DemoSiteFooter, DemoSiteHeader, demoAccent } from "@/components/demo-site";
import { EmbedFrame } from "@/components/embed-frame";
import { ListingPhoto } from "@/components/listing-photo";
import { address, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demo website", robots: { index: false } };

export default async function DemoListingPage({ params, searchParams }: { params: Promise<{ agencyId: string; listingId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { agencyId, listingId } = await params;
  const lang = (await searchParams).lang ?? "nl";
  const found = await bookableListing(listingId);
  if (!found || found.listing.agencyId !== agencyId) notFound();
  const { listing, agencyName } = found;

  const facts = [
    listing.bedrooms != null && { icon: BedDouble, label: `${listing.bedrooms} ${listing.bedrooms === 1 ? "slaapkamer" : "slaapkamers"}` },
    listing.bathrooms != null && { icon: Bath, label: `${listing.bathrooms} ${listing.bathrooms === 1 ? "badkamer" : "badkamers"}` },
    listing.livingArea && { icon: Ruler, label: `${listing.livingArea} m² bewoonbaar` },
    listing.plotArea && { icon: Trees, label: `${listing.plotArea} m² perceel` },
    listing.epcLabel && { icon: Leaf, label: `EPC ${listing.epcLabel} (${listing.epcScore} kWh/m²)` },
  ].filter(Boolean) as { icon: typeof Ruler; label: string }[];

  return (
    <>
      <DemoSiteHeader agencyId={agencyId} agencyName={agencyName} />
      <main className="mx-auto max-w-[1120px] px-4 py-6">
        <Link href={`/demo-site/${agencyId}`} className="flex items-center gap-1 text-[14px] text-black/60 hover:text-black">
          <ChevronLeft className="size-4" />
          Terug naar het aanbod
        </Link>
        <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0">
            <ListingPhoto src={listing.photos[0]?.url} alt={listing.title ?? listing.reference} className="aspect-[16/10] w-full rounded-lg" />
            <div className="mt-6 text-[12px] tracking-wide text-black/50 uppercase">
              {listing.transaction === "rent" ? "Te huur" : "Te koop"} · ref. {listing.reference}
            </div>
            <h1 className="mt-1 font-serif text-[30px] leading-tight font-semibold tracking-tight">{listing.title}</h1>
            <p className="mt-1 text-[16px] text-black/60">{[address(listing.street, listing.houseNumber, null), [listing.postcode, listing.city].filter(Boolean).join(" ")].join(", ")}</p>
            <p className="mt-3 text-[24px] font-semibold" style={{ color: demoAccent }}>
              {formatPrice(listing.price, listing.transaction)}
            </p>
            <ul className="mt-6 grid grid-cols-2 gap-3 border-y border-black/10 py-5 text-[15px] sm:grid-cols-3">
              {facts.map((f) => (
                <li key={f.label} className="flex items-center gap-2">
                  <f.icon className="size-4 text-black/50" />
                  {f.label}
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-prose text-[15px] leading-7 text-black/75">
              {listing.description ??
                "Een mooie kans in een gegeerde buurt. Neem contact op voor meer informatie of plan meteen zelf een bezoek in de agenda van onze makelaar."}
            </p>
          </div>

          <aside id="plan-bezoek" className="lg:sticky lg:top-6 lg:self-start">
            <div className="overflow-hidden rounded-xl border border-black/10 shadow-sm">
              <div className="px-4 pt-4 font-serif text-[19px] font-semibold">Plan een bezoek</div>
              <EmbedFrame src={`/embed/${listing.id}?lang=${lang}`} title="Plan een bezoek" />
            </div>
            <p className="mt-2 text-center text-[11px] text-black/40">Widget geladen via één regel code op de website van het kantoor</p>
          </aside>
        </div>
      </main>
      <DemoSiteFooter agencyName={agencyName} />
    </>
  );
}
