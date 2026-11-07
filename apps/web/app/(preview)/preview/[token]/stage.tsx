"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, House, Monitor, Smartphone, X } from "lucide-react";
import type { WidgetState } from "@/app/(public)/actions";
import { BookingWidget, type WidgetQuestion } from "@/components/booking/widget";
import { cn } from "@/lib/cn";
import type { SlotDay } from "@/lib/slots";
import { valuationText } from "@/lib/valuation-i18n";
import { widgetText, type WidgetLang } from "@/lib/widget-i18n";

type Listing = {
  url: string;
  title: string | null;
  street: string | null;
  houseNumber: string | null;
  postcode: string | null;
  city: string | null;
  price: number | null;
  transaction: "sale" | "rent" | null;
  photo: string | null;
  agentName: string | null;
  status: "active" | "under_offer";
  questions: WidgetQuestion[];
};

const text = {
  nl: {
    preview: "Preview",
    notLive: (host: string) => `Zo ziet de planner eruit op ${host}. Nog niet live: een boeking hier plant en verstuurt niets.`,
    home: "Homepagina",
    question: (place: string) => `Vragen over ${place}?`,
    orPlan: "Of een bezichtiging plannen?",
    hint: (who: string) => `Kies meteen een moment in de agenda van ${who}.`,
    plan: "Bezichtiging plannen",
    valuationIntro: "Op elke andere pagina vragen eigenaars hier een gratis schatting van hun woning:",
    valuationSteps: ["Adres en type woning", "Telefoonnummer bevestigen", "Schatting op basis van Statbel en jullie eigen verkopen", "De eigenaar komt als lead in jullie inbox"],
    picture: "Afbeelding van de website: deze site laat zich niet in een ander venster tonen.",
    desktop: "Computer",
    phone: "Telefoon",
    underOffer: "Onder optie",
    perMonth: "/maand",
  },
  fr: {
    preview: "Aperçu",
    notLive: (host: string) => `Voici le planificateur sur ${host}. Pas encore en ligne : une réservation ici ne planifie et n'envoie rien.`,
    home: "Page d'accueil",
    question: (place: string) => `Des questions sur ${place} ?`,
    orPlan: "Ou planifier une visite ?",
    hint: (who: string) => `Choisissez directement un moment dans l'agenda de ${who}.`,
    plan: "Planifier une visite",
    valuationIntro: "Sur toutes les autres pages, les propriétaires demandent ici une estimation gratuite :",
    valuationSteps: ["Adresse et type de bien", "Confirmation du numéro de téléphone", "Estimation basée sur Statbel et vos propres ventes", "Le propriétaire arrive comme lead dans votre boîte"],
    picture: "Image du site : ce site ne peut pas être affiché dans une autre fenêtre.",
    desktop: "Ordinateur",
    phone: "Téléphone",
    underOffer: "Sous option",
    perMonth: "/mois",
  },
  en: {
    preview: "Preview",
    notLive: (host: string) => `This is the planner on ${host}. Not live yet: booking here plans and sends nothing.`,
    home: "Home page",
    question: (place: string) => `Questions about ${place}?`,
    orPlan: "Or plan a viewing?",
    hint: (who: string) => `Pick a time in ${who}'s agenda right away.`,
    plan: "Plan a viewing",
    valuationIntro: "On every other page, owners ask for a free valuation of their home here:",
    valuationSteps: ["Address and type of home", "Confirm their phone number", "Estimate from Statbel and your own sales", "The owner lands in your inbox as a lead"],
    picture: "Picture of the website: this site doesn't allow being shown inside another page.",
    desktop: "Desktop",
    phone: "Phone",
    underOffer: "Under option",
    perMonth: "/month",
  },
} satisfies Record<WidgetLang, unknown>;

const place = (l: Listing) => [l.street, l.houseNumber].filter(Boolean).join(" ") || l.title || l.city || "";
const money = (n: number | null, lang: WidgetLang) =>
  n == null ? null : new Intl.NumberFormat({ nl: "nl-BE", fr: "fr-BE", en: "en-GB" }[lang], { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function PreviewStage({
  lang,
  token,
  site,
  name,
  brand,
  homeFramable,
  listingFramable,
  homeShot,
  listingShot,
  listings: all,
  days,
  action,
}: {
  lang: WidgetLang;
  token: string;
  site: string;
  name: string;
  brand: string | null;
  homeFramable: boolean;
  listingFramable: boolean;
  homeShot: boolean;
  listingShot: boolean;
  listings: Listing[];
  days: SlotDay[];
  action: (state: WidgetState, form: FormData) => Promise<WidgetState>;
}) {
  const t = text[lang];
  // Only the first listing has a picture: a site that can't be framed offers just that one.
  const listings = listingFramable ? all : all.slice(0, 1);
  const [view, setView] = useState<"home" | number>(listings.length ? 0 : "home");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [panel, setPanel] = useState(false);
  const [greeting, setGreeting] = useState(true);
  const colour = brand && /^#[0-9a-f]{6}$/i.test(brand) ? brand : "#171717";
  const listing = typeof view === "number" ? listings[view] : undefined;
  const host = new URL(site).hostname.replace(/^www\./, "");
  const framed = listing ? listingFramable : homeFramable;
  const shot = listing ? (listingShot ? "listing" : null) : homeShot ? "home" : null;
  const pageUrl = listing?.url ?? site;
  const valuation = valuationText[lang];

  const go = (next: "home" | number) => {
    setView(next);
    setPanel(false);
    setGreeting(true);
  };

  return (
    <>
      <header className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-panel px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 flex-none rounded-full" style={{ background: colour }} />
          <span className="truncate font-medium">{name}</span>
          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{t.preview}</span>
        </div>
        <nav className="order-last -mx-1 flex w-full min-w-0 items-center gap-1 overflow-x-auto md:order-none md:mx-0 md:w-auto md:flex-1" aria-label={t.preview}>
          <Tab active={view === "home"} onClick={() => go("home")}>
            <House className="size-3.5" />
            {t.home}
          </Tab>
          {listings.map((l, i) => (
            <Tab key={l.url} active={view === i} onClick={() => go(i)}>
              <CalendarDays className="size-3.5" />
              <span className="max-w-[180px] truncate">{place(l)}</span>
            </Tab>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {(["nl", "fr", "en"] as const).map((code) => (
            <Link
              key={code}
              href={`/preview/${token}?lang=${code}`}
              className={cn("rounded px-1.5 py-0.5 text-[12px] uppercase", code === lang ? "bg-hover font-medium" : "text-muted hover:text-fg")}
            >
              {code}
            </Link>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-line md:block" />
          <div className="hidden items-center md:flex">
            <IconToggle active={device === "desktop"} label={t.desktop} onClick={() => setDevice("desktop")}>
              <Monitor className="size-4" />
            </IconToggle>
            <IconToggle active={device === "phone"} label={t.phone} onClick={() => setDevice("phone")}>
              <Smartphone className="size-4" />
            </IconToggle>
          </div>
        </div>
        <p className="order-last w-full text-[11px] text-muted md:text-[12px]">{t.notLive(host)}</p>
      </header>

      <main className={cn("relative flex min-h-0 flex-1 justify-center bg-hover", device === "phone" && "py-4")}>
        <div className={cn("relative h-full w-full overflow-hidden bg-white", device === "phone" && "w-[390px] rounded-[28px] border-[6px] border-[#171717] shadow-xl")}>
          {framed ? (
            <iframe
              key={pageUrl}
              src={pageUrl}
              title={name}
              className="size-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              referrerPolicy="no-referrer"
            />
          ) : shot ? (
            <div className="size-full overflow-y-auto">
              {/* A picture taken on a computer, and one on a phone for small screens and the phone view. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/preview/shot/${token}/${shot}-phone`} alt={name} className={cn("block w-full", device === "desktop" && "md:hidden")} />
              {device === "desktop" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/preview/shot/${token}/${shot}`} alt={name} className="hidden w-full md:block" />
              )}
              <p className="bg-white px-4 py-3 text-center text-[12px] text-[#6b6b6b]">{t.picture}</p>
            </div>
          ) : (
            <div className="flex size-full items-center justify-center p-6 text-center text-muted">
              <a href={pageUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {pageUrl}
              </a>
            </div>
          )}

          {/* Our widget, on top of their page. */}
          <div className="pointer-events-none absolute inset-0" style={{ colorScheme: "light" }}>
            {!panel && listing && greeting && (
              <div className={cn("pointer-events-auto absolute right-4 bottom-4 w-[340px] max-w-[calc(100%-32px)] rounded-2xl p-4 text-white shadow-xl", device === "phone" && "right-3 bottom-3")} style={{ background: colour }}>
                <button type="button" onClick={() => setGreeting(false)} aria-label={widgetText[lang].back} className="absolute top-3 right-3 grid size-7 place-items-center rounded-full border border-white/40 hover:bg-white/10">
                  <X className="size-3.5" />
                </button>
                <p className="pr-8 text-[15px] leading-snug font-semibold">{t.question(place(listing))}</p>
                <p className="text-[15px] leading-snug font-semibold">{t.orPlan}</p>
                <p className="mt-1 text-[12px] text-white/80">{t.hint(listing.agentName?.split(" ")[0] ?? name)}</p>
                <button type="button" onClick={() => setPanel(true)} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white/15 font-medium hover:bg-white/25">
                  <CalendarDays className="size-4" />
                  {t.plan}
                </button>
              </div>
            )}
            {!panel && (!listing || !greeting) && (
              <button
                type="button"
                onClick={() => setPanel(true)}
                className="pointer-events-auto absolute right-5 bottom-5 flex h-12 items-center gap-2 rounded-full pr-[18px] pl-3.5 text-[15px] font-semibold text-white shadow-[0_6px_24px_rgba(0,0,0,.2)]"
                style={{ background: colour }}
              >
                {listing ? <CalendarDays className="size-5" /> : <House className="size-5" />}
                {listing ? widgetText[lang].title : valuation.launcher}
              </button>
            )}
            {panel && (
              <div
                role="dialog"
                aria-label={listing ? widgetText[lang].title : valuation.title}
                className={cn(
                  "pointer-events-auto absolute flex flex-col overflow-hidden bg-panel text-fg shadow-[0_12px_48px_rgba(0,0,0,.28)]",
                  device === "phone" ? "inset-0" : "inset-0 sm:inset-auto sm:right-5 sm:bottom-5 sm:h-[min(720px,calc(100%-40px))] sm:w-[420px] sm:rounded-[14px]",
                )}
              >
                <div className="flex h-12 flex-none items-center justify-between border-b border-line pr-2 pl-4 font-semibold">
                  <span>{listing ? widgetText[lang].title : valuation.title}</span>
                  <button type="button" onClick={() => setPanel(false)} aria-label={valuation.close} className="grid size-10 place-items-center rounded-lg hover:bg-hover">
                    <X className="size-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4" style={{ "--brand": colour, "--brand-fg": "#ffffff" } as React.CSSProperties}>
                  {listing ? (
                    <>
                      <div className="mb-4 flex items-center gap-3 rounded-lg border border-line p-2">
                        {listing.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={listing.photo} alt="" className="size-14 flex-none rounded-md object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="grid size-14 flex-none place-items-center rounded-md bg-hover">
                            <House className="size-5 text-muted" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{place(listing)}</p>
                          <p className="truncate text-[12px] text-muted">
                            {[listing.postcode, listing.city].filter(Boolean).join(" ")}
                            {money(listing.price, lang) ? ` · ${money(listing.price, lang)}${listing.transaction === "rent" ? t.perMonth : ""}` : ""}
                            {listing.status === "under_offer" ? ` · ${t.underOffer}` : ""}
                          </p>
                        </div>
                      </div>
                      <BookingWidget
                        key={listing.url}
                        lang={lang}
                        days={days}
                        questions={listing.questions}
                        agentName={listing.agentName ?? name}
                        slotMinutes={30}
                        agencyName={name}
                        action={action}
                      />
                    </>
                  ) : (
                    <div>
                      <p className="text-muted">{t.valuationIntro}</p>
                      <ol className="mt-3 flex flex-col gap-2">
                        {t.valuationSteps.map((step, i) => (
                          <li key={step} className="flex items-start gap-2.5">
                            <span className="grid size-6 flex-none place-items-center rounded-full text-[12px] font-semibold text-white" style={{ background: colour }}>
                              {i + 1}
                            </span>
                            <span className="pt-0.5">{step}</span>
                          </li>
                        ))}
                      </ol>
                      {listings.length > 0 && (
                        <button type="button" onClick={() => go(0)} className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-md font-medium text-white" style={{ background: colour }}>
                          <CalendarDays className="size-4" />
                          {t.plan}: {place(listings[0]!)}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex h-7 flex-none items-center gap-1.5 rounded-md px-2.5 text-[12px]", active ? "bg-hover font-medium text-fg" : "text-muted hover:text-fg")}
    >
      {children}
    </button>
  );
}

function IconToggle({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cn("grid size-7 place-items-center rounded-md", active ? "bg-hover text-fg" : "text-muted hover:text-fg")}>
      {children}
    </button>
  );
}
