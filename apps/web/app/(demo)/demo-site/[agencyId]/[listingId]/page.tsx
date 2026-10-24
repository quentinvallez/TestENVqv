import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { runTool, tools } from "@viewing/core";
import { bookableListing, listingAgent, publicContext } from "@viewing/core/public";
import { BedDouble, Bath, ChevronLeft, Leaf, Mail, Phone, Ruler, Trees } from "lucide-react";
import { DemoSiteFooter, DemoSiteHeader, demoAccent } from "@/components/demo-site";
import { WidgetSlot } from "@/components/widget-slot";
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
  const [agent, similar] = await Promise.all([listingAgent(listing.id), runTool(tools.similarListings, publicContext(listing.agencyId), { listingId: listing.id })]);

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
        <a href={`/demo-site/${agencyId}`} className="flex items-center gap-1 text-[14px] text-black/60 hover:text-black">
          <ChevronLeft className="size-4" />
          Terug naar het aanbod
        </a>
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

          <aside id="plan-bezoek" className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            {agent && (
              // How agency sites usually show the agent. widget.js reads this name to pick the agent's calendar.
              <div className="flex items-center gap-3 rounded-xl border border-black/10 p-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-white" style={{ background: agent.color ?? demoAccent }}>
                  {agent.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] text-black/50">Uw makelaar</div>
                  <div className="font-semibold">{agent.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-black/60">
                    {agent.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3.5" />
                        {agent.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Mail className="size-3.5" />
                      {agent.email}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-black/10 shadow-sm">
              <div className="px-4 pt-4 font-serif text-[19px] font-semibold">Plan een bezoek</div>
              <WidgetSlot attributes={{ "data-viewing-widget": "", "data-listing": listing.reference, "data-lang": lang }} agencyId={agencyId} />
            </div>
            <p className="text-center text-[11px] text-black/40">Widget geladen via één regel code op de website van het kantoor</p>
          </aside>
        </div>
        {similar.length > 0 && (
          // Based on this page only: no tracking of the visitor, so no cookie consent needed.
          <section className="mt-14">
            <h2 className="font-serif text-[22px] font-semibold">Ook interessant</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-3">
              {similar.map((l) => (
                <a key={l.id} href={`/demo-site/${agencyId}/${l.id}`} className="group overflow-hidden rounded-lg border border-black/10">
                  <ListingPhoto src={l.photos[0]?.url} alt={l.title ?? l.reference} className="aspect-[4/3] w-full" />
                  <div className="p-3">
                    <div className="font-medium group-hover:underline">{l.title}</div>
                    <div className="text-[13px] text-black/60">{address(l.street, l.houseNumber, l.city)}</div>
                    <div className="mt-1 font-semibold">{formatPrice(l.price, l.transaction)}</div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
      <DemoSiteFooter agencyName={agencyName} />
    </>
  );
}
