import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicAgency } from "@viewing/core/public";
import { ValuationWidget } from "@/components/valuation/valuation-widget";
import { toWidgetLang } from "@/lib/widget-i18n";
import { requestValuationAction, verifyValuationAction } from "../../../(public)/valuation-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Valuation", robots: { index: false } };

/** The valuation widget as widget.js loads it on an agency's website. */
export default async function ValuationEmbedPage({ searchParams }: { searchParams: Promise<{ agency?: string; lang?: string }> }) {
  const query = await searchParams;
  const agency = query.agency ? await publicAgency(query.agency) : null;
  if (!agency) notFound();
  const lang = toWidgetLang(query.lang);
  const brand = agency.branding?.primaryColor;

  return (
    <div style={{ "--brand": brand ?? "var(--primary)", "--brand-fg": brand ? "#ffffff" : "var(--primary-fg)" } as React.CSSProperties}>
      <ValuationWidget lang={lang} agencyName={agency.name} request={requestValuationAction.bind(null, agency.id, lang)} verify={verifyValuationAction.bind(null, lang)} />
    </div>
  );
}
