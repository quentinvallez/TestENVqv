import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { runTool, tools } from "@viewing/core";
import { occupantAgency, publicContext } from "@viewing/core/public";
import { AGENCY_TIMEZONE } from "@viewing/core/time";
import { CalendarPlus, Clock, MapPin, Phone, UserRound } from "lucide-react";
import { BookingShell } from "@/components/booking/shell";
import { OccupantAvailabilityForm } from "@/components/occupant/availability-form";
import { ProblemForm } from "@/components/occupant/problem-form";
import { occupantText } from "@/lib/occupant-i18n";
import { toWidgetLang } from "@/lib/widget-i18n";
import { reportProblemAction, saveOccupantAvailabilityAction } from "../../occupant-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Viewings of your home", robots: { index: false, follow: false } };

const locales = { nl: "nl-BE", fr: "fr-BE", en: "en-GB" } as const;
const localDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: AGENCY_TIMEZONE }).format(date);

/** The owner's or tenant's own page, opened from the link the agency sent them. No account. */
export default async function OccupantPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const found = await occupantAgency(token);
  if (!found) notFound();
  const page = await runTool(tools.getOccupantPage, publicContext(found.agencyId), { token });
  const lang = query.lang ? toWidgetLang(query.lang) : page.occupant.language;
  const t = occupantText[lang];
  const day = new Intl.DateTimeFormat(locales[lang], { timeZone: AGENCY_TIMEZONE, weekday: "long", day: "numeric", month: "long" });
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, hour: "2-digit", minute: "2-digit" });
  const h = await headers();
  const feed = `webcal://${h.get("host")}/s/${token}/calendar.ics`;
  const occupied = page.listing.access !== "agent";

  return (
    <BookingShell agencyName={found.agencyName} branding={found.branding}>
      <div className="border-b border-line p-5">
        <p className="text-muted">{t.hello(page.occupant.firstName ?? "")}</p>
        <h1 className="mt-0.5 text-[17px] font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-muted">
          <MapPin className="size-3.5" />
          {[page.listing.address, page.listing.postcode].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-3">{occupied ? t.intro : t.introAgent}</p>
      </div>

      <section className="border-b border-line p-5">
        <h2 className="mb-3 font-medium">{t.upcoming}</h2>
        {page.viewings.length === 0 ? (
          <p className="text-muted">{t.none}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {page.viewings.map((v) => (
              <li key={v.id} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Clock className="size-3.5 text-muted" />
                  <span className="font-medium first-letter:uppercase">{day.format(v.startsAt)}</span>
                  <span className="tabular-nums">
                    {time.format(v.startsAt)}–{time.format(v.endsAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-muted">
                  <UserRound className="size-3.5" />
                  {v.visitor}
                  {v.agentName && <span>· {t.with(v.agentName)}</span>}
                </div>
                {occupied && <ProblemForm lang={lang} action={reportProblemAction.bind(null, token, v.id)} />}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[12px] text-faint">{t.privacy}</p>
        <a href={feed} className="mt-4 flex h-10 items-center justify-center gap-2 rounded-md border border-line font-medium hover:bg-hover">
          <CalendarPlus className="size-4" />
          {t.calendar}
        </a>
        <p className="mt-1 text-center text-[12px] text-muted">{t.calendarHint}</p>
      </section>

      {occupied && (
        <section className="border-b border-line p-5">
          <h2 className="font-medium">{t.when}</h2>
          <p className="mb-4 text-muted">{t.whenHint}</p>
          <OccupantAvailabilityForm
            lang={lang}
            windows={page.windows}
            away={page.blocks.map((b) => ({ from: localDate(b.startsAt), to: localDate(new Date(b.endsAt.getTime() - 1)) }))}
            noticeHours={page.listing.viewingNoticeHours}
            action={saveOccupantAvailabilityAction.bind(null, token)}
          />
        </section>
      )}

      {page.agent && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 p-5 text-muted">
          <span>{t.contact}</span>
          <span className="font-medium text-fg">{page.agent.name}</span>
          {page.agent.phone && (
            <a href={`tel:${page.agent.phone}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
              <Phone className="size-3.5" />
              {page.agent.phone}
            </a>
          )}
          {page.agent.email && (
            <a href={`mailto:${page.agent.email}`} className="underline-offset-2 hover:underline">
              {page.agent.email}
            </a>
          )}
        </div>
      )}
    </BookingShell>
  );
}
