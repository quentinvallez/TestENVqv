import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicAgency } from "@viewing/core/public";
import { DemoSiteFooter, DemoSiteHeader } from "@/components/demo-site";
import { WidgetSlot } from "@/components/widget-slot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demo website", robots: { index: false } };

export default async function DemoSellPage({ params, searchParams }: { params: Promise<{ agencyId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { agencyId } = await params;
  const lang = (await searchParams).lang ?? "nl";
  const agency = await publicAgency(agencyId);
  if (!agency) notFound();

  return (
    <>
      <DemoSiteHeader agencyId={agencyId} agencyName={agency.name} active="sell" />
      <main className="mx-auto grid max-w-[1120px] gap-10 px-4 py-10 lg:grid-cols-[1fr_440px]">
        <div>
          <h1 className="font-serif text-[34px] leading-tight font-semibold tracking-tight">Uw woning verkopen?</h1>
          <p className="mt-3 max-w-prose text-[16px] leading-7 text-black/70">
            Ontdek in twee minuten wat uw woning waard is, op basis van de verkoopprijzen in uw gemeente en onze recente verkopen in de buurt. Daarna
            komt een van onze makelaars graag gratis langs voor een nauwkeurige waardebepaling.
          </p>
          <ul className="mt-6 flex flex-col gap-2 text-[15px] text-black/70">
            <li>✓ Gratis en vrijblijvend</li>
            <li>✓ Echte verkoopcijfers uit uw buurt</li>
            <li>✓ Rapport meteen op uw scherm</li>
          </ul>
        </div>
        <div className="overflow-hidden rounded-xl border border-black/10 shadow-sm">
          <div className="px-4 pt-4 font-serif text-[20px] font-semibold">Wat is mijn woning waard?</div>
          {/* The whole valuation is this one element plus the agency's widget.js script. */}
          <WidgetSlot attributes={{ "data-viewing-valuation": "", "data-lang": lang }} agencyId={agencyId} />
        </div>
      </main>
      <DemoSiteFooter agencyName={agency.name} />
    </>
  );
}
