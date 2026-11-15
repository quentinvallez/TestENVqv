import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { privacyNoticeFacts } from "@viewing/core/public";
import { BookingShell } from "@/components/booking/shell";
import { cn } from "@/lib/cn";
import { privacyText } from "@/lib/privacy-i18n";
import { toWidgetLang, type WidgetLang } from "@/lib/widget-i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

/** The agency's privacy notice for its clients, linked from the booking and valuation forms. */
export default async function PrivacyNoticePage({ params, searchParams }: { params: Promise<{ agencyId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ agencyId }, query] = await Promise.all([params, searchParams]);
  const facts = await privacyNoticeFacts(agencyId);
  if (!facts) notFound();
  const lang = toWidgetLang(query.lang);
  const t = privacyText[lang];
  const contact = facts.contactEmail ?? facts.websiteUrl ?? facts.name;

  return (
    <BookingShell agencyName={facts.name} branding={facts.branding}>
      <div className="rounded-xl border border-line bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[18px] font-semibold tracking-tight">{t.title(facts.name)}</h1>
          <nav aria-label={t.languages} className="flex gap-1 text-[12px]">
            {(["nl", "fr", "en", "de"] as WidgetLang[]).map((l) => (
              <Link key={l} href={`?lang=${l}`} className={cn("rounded px-1.5 py-0.5 uppercase", l === lang ? "bg-hover font-medium" : "text-muted hover:text-fg")}>
                {l}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-1 text-[12px] text-faint">{t.updated}</p>
        <div className="mt-5 flex flex-col gap-5">
          {t.sections({ agency: facts.name, retentionMonths: facts.retentionMonths, contact }).map((section) => (
            <section key={section.title}>
              <h2 className="font-medium">{section.title}</h2>
              {section.body.map((p, i) => (
                <p key={i} className="mt-1.5 text-muted">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </BookingShell>
  );
}
