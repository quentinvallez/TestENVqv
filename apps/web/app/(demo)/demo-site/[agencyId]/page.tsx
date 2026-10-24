import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicAgency, publicListings } from "@viewing/core/public";
import { DemoSiteFooter, DemoSiteHeader } from "@/components/demo-site";
import { ListingPhoto } from "@/components/listing-photo";
import { address, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demo website", robots: { index: false } };

export default async function DemoSiteHome({ params }: { params: Promise<{ agencyId: string }> }) {
  const { agencyId } = await params;
  const agency = await publicAgency(agencyId);
  if (!agency) notFound();
  const listings = await publicListings(agencyId);

  return (
    <>
      <DemoSiteHeader agencyId={agencyId} agencyName={agency.name} />
      <main className="mx-auto max-w-[1120px] px-4 py-10">
        <h1 className="font-serif text-[32px] font-semibold tracking-tight">Ons aanbod</h1>
        <p className="mt-1 text-black/60">{listings.length} panden te koop en te huur in Antwerpen en Gent</p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <a key={l.id} href={`/demo-site/${agencyId}/${l.id}`} className="group overflow-hidden rounded-lg border border-black/10">
              <ListingPhoto src={l.photos[0]?.url} alt={l.title ?? l.reference} className="aspect-[4/3] w-full" />
              <div className="p-4">
                <div className="text-[12px] tracking-wide text-black/50 uppercase">{l.transaction === "rent" ? "Te huur" : "Te koop"} · {l.city}</div>
                <div className="mt-1 font-medium group-hover:underline">{l.title}</div>
                <div className="mt-0.5 text-[14px] text-black/60">{address(l.street, l.houseNumber, l.city)}</div>
                <div className="mt-2 font-semibold">{formatPrice(l.price, l.transaction)}</div>
              </div>
            </a>
          ))}
        </div>
      </main>
      <DemoSiteFooter agencyName={agency.name} />
    </>
  );
}
