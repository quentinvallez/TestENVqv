import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { runTool, tools } from "@viewing/core";
import { publicContext, valuationAgency } from "@viewing/core/public";
import { MapPin, TrendingUp } from "lucide-react";
import { BookingShell } from "@/components/booking/shell";
import { VisitBooker } from "@/components/valuation/visit-booker";
import { groupSlotsByDay } from "@/lib/slots";
import { valuationText } from "@/lib/valuation-i18n";
import { toWidgetLang } from "@/lib/widget-i18n";
import { bookVisitAction } from "../../valuation-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Valuation report", robots: { index: false } };

const euro = (n: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
/** Statbel writes names in capitals ("SINT-MARTENS-LATEM"); show them as "Sint-Martens-Latem". */
const titleCase = (name: string) => name.toLowerCase().replace(/(^|[\s\-'(])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
const monthYear = (iso: string, lang: string) =>
  new Intl.DateTimeFormat({ nl: "nl-BE", fr: "fr-BE", en: "en-GB" }[lang], { month: "short", year: "numeric" }).format(new Date(iso));

export default async function ValuationReportPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { token } = await params;
  const agency = await valuationAgency(token);
  if (!agency) notFound();
  const ctx = publicContext(agency.agencyId);
  const valuation = await runTool(tools.getValuation, ctx, { token });
  if (!valuation?.verifiedAt) notFound(); // the report only exists once the phone is confirmed
  const lang = toWidgetLang((await searchParams).lang ?? valuation.language);
  const t = valuationText[lang];
  const r = valuation.result;
  const slots = valuation.agentId ? (await runTool(tools.availableSlots, ctx, { agentId: valuation.agentId, days: 14, minutes: 60 })).slots : [];
  const address = `${[valuation.street, valuation.houseNumber].filter(Boolean).join(" ")}, ${valuation.postcode} ${valuation.city}`;

  return (
    <BookingShell agencyName={agency.agencyName} branding={agency.branding}>
      <div className="border-b border-line p-5">
        <div className="text-[12px] text-muted">{t.report.title}</div>
        <h1 className="mt-0.5 flex items-center gap-1.5 text-[17px] font-semibold tracking-tight">
          <MapPin className="size-4 shrink-0 text-muted" />
          {address}
        </h1>
        <p className="mt-0.5 text-muted">
          {t.types[valuation.answers.propertyType]} · {valuation.answers.livingArea} m² · {t.conditions[valuation.answers.condition]}
          {valuation.answers.epcLabel ? ` · EPC ${valuation.answers.epcLabel}` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-6 p-5">
        {r ? (
          <section className="rounded-lg bg-hover p-4 text-center">
            <div className="text-[12px] text-muted">{t.resultTitle}</div>
            <div className="mt-1 text-[26px] font-semibold tracking-tight tabular-nums">
              {euro(r.low)} – {euro(r.high)}
            </div>
            <div className="mt-1 text-[12px] text-muted">{t.confidence[r.confidence]}</div>
          </section>
        ) : (
          <p className="rounded-lg bg-hover p-4 text-muted">{t.noEstimate}</p>
        )}

        <section>
          <h2 className="mb-1 flex items-center gap-1.5 font-medium">
            <TrendingUp className="size-4 text-muted" />
            {t.report.marketTitle}
          </h2>
          {r?.marketMedian ? (
            <p className="text-muted">
              <span className="font-medium text-fg tabular-nums">{euro(r.marketMedian.median)}</span> ·{" "}
              {t.report.market(titleCase(r.marketMedian.municipality), r.marketMedian.period ?? String(r.marketMedian.year), r.marketMedian.transactions)}
            </p>
          ) : (
            <p className="text-muted">{t.report.noMarket}</p>
          )}
        </section>

        {r && r.comparables.length > 0 && (
          <section>
            <h2 className="font-medium">{t.report.comparablesTitle}</h2>
            <p className="mb-2 text-[12px] text-faint">{t.report.comparablesNote}</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {r.comparables.map((c, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      {c.street}, {c.city}
                    </div>
                    <div className="text-[12px] text-muted">
                      {t.types[c.propertyType] ?? c.propertyType}
                      {c.livingArea ? ` · ${c.livingArea} m²` : ""} · {t.report.sold} {monthYear(c.soldAt, lang)}
                    </div>
                  </div>
                  <div className="font-medium tabular-nums">{euro(c.price)}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {r && (
          <section>
            <h2 className="mb-2 font-medium">{t.report.adjustmentsTitle}</h2>
            <ul className="flex flex-wrap gap-1.5">
              {r.adjustments
                .filter((a) => Math.abs(a.factor - 1) >= 0.005)
                .map((a) => (
                  <li key={a.key} className="rounded-full border border-line px-2.5 py-1 text-[12px]">
                    {t.report.adjustments[a.key] ?? a.key}{" "}
                    <span className={a.factor >= 1 ? "text-success" : "text-danger"}>
                      {a.factor >= 1 ? "+" : "−"}
                      {Math.round(Math.abs(a.factor - 1) * 100)}%
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        )}

        {valuation.agent && (
          <section className="border-t border-line pt-5">
            <h2 className="font-medium">{t.report.visitTitle}</h2>
            <p className="mb-3 text-muted">{t.report.visitText(valuation.agent.name)}</p>
            <VisitBooker days={groupSlotsByDay(slots, lang)} label={t.report.book} bookedText={t.report.booked("{when}")} action={bookVisitAction.bind(null, token, lang)} />
          </section>
        )}

        <p className="text-center text-[11px] text-faint">{t.report.disclaimer}</p>
      </div>
    </BookingShell>
  );
}
