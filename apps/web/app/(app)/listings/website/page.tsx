import Link from "next/link";
import { runTool, tools } from "@viewing/core";
import { AlertTriangle, ExternalLink, Globe, Sparkles, UserRound } from "lucide-react";
import { ListingPhoto } from "@/components/listing-photo";
import { AiPill, PageHeader, Panel, Pill, Stat, StatusDot } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { address, formatPrice, formatRelative } from "@/lib/format";
import { listingStatusMeta } from "@/lib/labels";
import { importMissingListingAction, importWebsiteAction } from "../../actions";
import { ImportForm } from "./import-form";
import { MissingListingForm } from "./missing-form";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n";

export const dynamic = "force-dynamic";
// The import runs inside the server action of this page.
export const maxDuration = 60;

async function ReadBy({ by }: { by: string | null }) {
  const t = await getT();
  if (by === "ai") return <AiPill>{t("Read by Claude")}</AiPill>;
  return <Pill>{by === "structured" ? t("Page data") : t("Rules")}</Pill>;
}

/** What the pages we found on the site turned out to be, as one thin bar with a legend. */
async function PageBreakdown({ counts }: { counts: { onOffer: number; underOffer: number; offMarket: number; pending: number; gone: number; other: number; error: number } }) {
  const t = await getT();
  const parts = [
    { label: msg("on offer"), value: counts.onOffer, className: "bg-fg" },
    { label: msg("under option"), value: counts.underOffer, className: "bg-muted" },
    { label: msg("sold or rented (not listed)"), value: counts.offMarket, className: "bg-faint" },
    { label: msg("to read"), value: counts.pending, className: "bg-info" },
    { label: msg("taken offline"), value: counts.gone, className: "bg-line-strong" },
    { label: msg("not a listing"), value: counts.other, className: "bg-line" },
    { label: msg("could not be read"), value: counts.error, className: "bg-danger" },
  ].filter((p) => p.value > 0);
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (!total) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[13px]">
        {t.rich("<b>{total}</b> listings on your site: {onOffer} on offer, {underOffer} under option", { b: (c) => <span className="font-medium tabular-nums">{c}</span> }, {
          total: counts.onOffer + counts.underOffer,
          onOffer: counts.onOffer,
          underOffer: counts.underOffer,
        })}
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-hover" aria-hidden>
        {parts.map((p) => (
          <div key={p.label} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
        <span>{t("{n} pages found:", { n: total })}</span>
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5 tabular-nums">
            <span className={`size-1.5 rounded-full ${p.className}`} />
            {p.value} {t(p.label)}
          </span>
        ))}
      </div>
    </div>
  );
}

type Overview = Awaited<ReturnType<typeof tools.websiteImportStatus.run>>["overviews"][number];

const cardParts = [
  { key: "onOffer", label: msg("on offer"), className: "bg-fg" },
  { key: "underOffer", label: msg("under option"), className: "bg-muted" },
  { key: "soldOrRented", label: msg("sold or rented"), className: "bg-faint" },
  { key: "toRead", label: msg("to read"), className: "bg-info" },
  { key: "offline", label: msg("taken offline"), className: "bg-line-strong" },
  { key: "notListing", label: msg("not a listing"), className: "bg-line-strong" },
  { key: "failed", label: msg("could not be read"), className: "bg-danger" },
] as const;

const viaLabel: Record<Overview["via"], string> = {
  single: msg("all on one page"),
  links: msg("through its page links"),
  form: msg("through its search form"),
  guess: msg("page by page"),
  browser: msg("read with a browser, scrolling"),
  sitemap: msg("its listings from the site's sitemap"),
};

/** The overview's address as people read it; escapes that aren't valid UTF-8 stay as written. */
function shownAddress(url: URL) {
  try {
    return decodeURIComponent(url.pathname + url.search);
  } catch {
    return url.pathname + url.search;
  }
}

/** One overview of the site (for sale, for rent, new builds): what it says it has, what we found, and what those turned out to be. */
async function OverviewRow({ overview: o }: { overview: Overview }) {
  const t = await getT();
  const url = new URL(o.url);
  const parts = cardParts.map((p) => ({ ...p, value: o.counts[p.key] })).filter((p) => p.value > 0);
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const missing = o.stated != null ? Math.max(0, o.stated - o.found) : 0;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <a href={o.url} target="_blank" rel="noreferrer" className="min-w-0 truncate font-medium hover:underline">
          {shownAddress(url)}
        </a>
        <span className="flex items-center gap-1.5 tabular-nums">
          {o.stated != null ? (
            <>
              <StatusDot color={missing ? "var(--warning)" : "var(--success)"} className="size-1.5" />
              {missing ? t("{found} of {stated} found", { found: o.found, stated: o.stated }) : t("{n} on your site, all found", { n: o.stated })}
            </>
          ) : (
            <span className="text-muted">{t("{n} found; the page shows no total", { n: o.found })}</span>
          )}
        </span>
      </div>
      {total > 0 && (
        <>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-hover" aria-hidden>
            {parts.map((p) => (
              <div key={p.key} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
            {parts.map((p) => (
              <span key={p.key} className="flex items-center gap-1.5 tabular-nums">
                <span className={`size-1.5 rounded-full ${p.className}`} />
                {p.value} {t(p.label)}
              </span>
            ))}
          </div>
        </>
      )}
      <div className="mt-1 text-[12px] text-faint">
        {t(viaLabel[o.via])}
        {o.via !== "single" && `, ${o.pages === 1 ? t("1 page") : t("{n} pages", { n: o.pages })}`}
        {!o.complete && `; ${t("still going through it")}`}
        {o.complete && missing > 0 && `; ${missing === 1 ? t("1 card we couldn't reach. Paste the link of a missing listing below.") : t("{n} cards we couldn't reach. Paste the link of a missing listing below.", { n: missing })}`}
      </div>
    </li>
  );
}

export default async function WebsiteImportPage() {
  const t = await getT();
  const status = await runTool(tools.websiteImportStatus, await getToolContext(), {});
  const { sync } = status;
  const host = status.websiteUrl ? new URL(status.websiteUrl).host : null;

  return (
    <>
      <PageHeader crumbs={[{ label: t("Listings"), href: "/listings" }, { label: t("From your website") }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-4 py-6 md:px-5">
          <h1 className="text-[18px] font-semibold tracking-tight">{t("Your listings, read from your website")}</h1>
          <p className="mt-1 max-w-2xl text-muted">
            {t("Give your website address and we find every listing on it, with its price, address, details, photos and the agent the page names. Every night we read it again: new listings appear, price and status changes follow, and listings you take off your site are archived here.")}
          </p>

          <Panel className="mt-5 p-4">
            <ImportForm action={importWebsiteAction} websiteUrl={status.websiteUrl} label={status.websiteUrl ? t("Check again now") : t("Import listings")} />
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-faint">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" />
              {status.aiAvailable
                ? t("Most pages are read by rules. When a page is laid out in a way they don't understand, Claude reads it; those listings are marked.")
                : t("Pages are read by rules. With Claude connected, pages the rules don't fully understand would be read by Claude.")}
            </p>
          </Panel>

          {sync.lastRunAt && (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={t("Listings read")} value={sync.found ?? 0} hint={sync.pages ? t("of {n} listing pages found", { n: sync.pages }) : (host ?? undefined)} />
                <Stat label={t("New in last run")} value={sync.created ?? 0} />
                <Stat label={t("Checked or updated")} value={sync.updated ?? 0} />
                <Stat label={t("Removed from site")} value={sync.removed ?? 0} hint={t("Archived here")} />
              </div>
              <p className="mt-2 text-[12px] text-muted">
                {t("Last read {when}.", { when: t.relative(new Date(sync.lastRunAt)) })}
                {(sync.remaining ?? 0) > 0 && ` ${t("{n} pages still to read; the next run continues with them.", { n: sync.remaining ?? 0 })}`}
                {sync.error && <span className="text-danger"> {sync.error}</span>}
              </p>
              <PageBreakdown counts={status.pageCounts} />
              {status.overviews.length > 0 && (
                <section className="mt-5">
                  <h2 className="font-medium">{t("What your website shows")}</h2>
                  <p className="mt-0.5 max-w-2xl text-[12px] text-muted">
                    {t("Each overview on your site, with the number it shows next to what we found on it. That number often counts sold listings too. Listings on offer and under option go to your listings; under option ones take no bookings and show no booking button on your site. A listing can show on more than one overview, so the totals for your whole site are the ones above.")}
                  </p>
                  <Panel className="mt-2">
                    <ul className="divide-y divide-line">
                      {status.overviews.map((o) => (
                        <OverviewRow key={o.url} overview={o} />
                      ))}
                    </ul>
                  </Panel>
                  {status.searching && <p className="mt-2 text-[12px] text-muted">{t("We are still going through your overview pages; the next run continues.")}</p>}
                </section>
              )}
              <Panel className="mt-3 p-4">
                <div className="font-medium">{t("A listing missing?")}</div>
                <p className="mt-0.5 mb-2 text-[12px] text-muted">{t("Paste its link from your website. We read it right away, and note that our search missed it.")}</p>
                <MissingListingForm action={importMissingListingAction} />
              </Panel>
              {((sync.blocked ?? 0) > 0 || (sync.crawlDelay ?? 0) > 1) && (
                <p className="mt-2 max-w-2xl text-[12px] text-muted">
                  {t("We follow your website's robots.txt.")}
                  {(sync.blocked ?? 0) > 0 &&
                    ` ${sync.blocked === 1 ? t("It doesn't allow crawlers on 1 listing page, so we leave it out.") : t("It doesn't allow crawlers on {n} listing pages, so we leave them out.", { n: sync.blocked ?? 0 })}`}
                  {(sync.crawlDelay ?? 0) > 1 && ` ${t("It asks for {n} seconds between pages, so a full read takes several nights.", { n: sync.crawlDelay ?? 0 })}`}{" "}
                  {t("To let us read all listings at a normal pace, add these two lines to it:")}{" "}
                  <code className="rounded bg-hover px-1 font-mono">User-agent: ViewingBot</code> <code className="rounded bg-hover px-1 font-mono">Allow: /</code>
                </p>
              )}
            </>
          )}

          {status.websiteAgents.length > 0 && (
            <Panel className="mt-5 flex items-start gap-3 p-4">
              <UserRound className="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <div className="font-medium">
                  {status.websiteAgents.length === 1 ? t("1 agent added from your website") : t("{n} agents added from your website", { n: status.websiteAgents.length })}
                </div>
                <p className="mt-0.5 text-muted">
                  {status.websiteAgents.map((a) => a.name).join(", ")}.{" "}
                  {t.rich("Their listings take bookings from Monday to Friday, 9:00 to 18:00. Check their hours and email in <a>Agents</a>.", {
                    a: (c) => (
                      <Link href="/agents" className="text-fg underline underline-offset-2">
                        {c}
                      </Link>
                    ),
                  })}
                </p>
              </div>
            </Panel>
          )}

          {(status.withoutAgent > 0 || status.unknownAgents.length > 0) && (
            <Panel className="mt-5 flex items-start gap-3 p-4">
              <UserRound className="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <div className="font-medium">
                  {status.withoutAgent === 1 ? t("1 listing has no agent yet") : t("{n} listings have no agent yet", { n: status.withoutAgent })}
                </div>
                <p className="mt-0.5 text-muted">
                  {status.unknownAgents.length > 0
                    ? t(status.unknownAgents.length === 1 ? msg("Your website names {names}, who isn't an agent here yet. Until then, open the listing to pick the agent whose calendar takes the bookings.") : msg("Your website names {names}, who aren't agents here yet. Until then, open the listing to pick the agent whose calendar takes the bookings."), { names: status.unknownAgents.join(", ") })
                    : t("Open the listing to pick the agent whose calendar takes the bookings.")}
                </p>
              </div>
            </Panel>
          )}

          {status.listings.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 font-medium">
                {t("Imported listings")} <span className="font-normal text-muted tabular-nums">{status.listings.length}</span>
              </h2>
              <Panel className="overflow-hidden">
                <ul className="divide-y divide-line md:hidden">
                  {status.listings.map((l, i) => (
                    <li key={l.url}>
                      <Link href={`/listings/${l.listingId}`} className="flex gap-3 px-4 py-3 active:bg-hover">
                        <span className="w-6 shrink-0 pt-0.5 text-right text-[12px] text-faint tabular-nums">{i + 1}</span>
                        <ListingPhoto src={l.photo} alt={l.title ?? l.reference ?? ""} className="h-16 w-20 shrink-0 rounded-md border border-line" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{address(l.street, l.houseNumber, l.city) || l.title}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                            {l.status && <StatusDot color={listingStatusMeta[l.status].color} className="size-1.5" />}
                            {l.status && t(listingStatusMeta[l.status].label)} · {t.price(l.price, l.transaction ?? undefined)}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                            <ReadBy by={l.extractedBy} />
                            <span className="truncate">{l.listingAgentName ?? (l.agentName ? t("Page names {name}", { name: l.agentName }) : t("No agent"))}</span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                <table className="hidden w-full text-left md:table">
                  <thead className="bg-panel text-[12px] text-muted">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-1 pl-4 text-right font-normal">#</th>
                      <th className="py-2 pr-3 pl-3 font-normal">{t("Property")}</th>
                      <th className="px-3 font-normal">{t("Status")}</th>
                      <th className="px-3 font-normal">{t("Price")}</th>
                      <th className="px-3 font-normal">{t("Agent")}</th>
                      <th className="px-3 font-normal">{t("Read by")}</th>
                      <th className="py-2 pr-4 pl-3 font-normal">
                        <span className="sr-only">{t("Page")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {status.listings.map((l, i) => (
                      <tr key={l.url} className="group hover:bg-hover/60">
                        <td className="w-10 py-2 pr-1 pl-4 text-right text-[12px] text-faint tabular-nums">{i + 1}</td>
                        <td className="py-2 pr-3 pl-3">
                          <Link href={`/listings/${l.listingId}`} className="flex items-center gap-3">
                            <ListingPhoto src={l.photo} alt={l.title ?? l.reference ?? ""} className="h-10 w-14 shrink-0 rounded-md border border-line" />
                            <div className="min-w-0">
                              <div className="max-w-[300px] truncate font-medium group-hover:underline">{address(l.street, l.houseNumber, l.city) || l.title}</div>
                              <div className="text-[12px] text-muted">{l.reference}</div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-3 whitespace-nowrap">
                          {l.status && (
                            <span className="flex items-center gap-1.5">
                              <StatusDot color={listingStatusMeta[l.status].color} />
                              {t(listingStatusMeta[l.status].label)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 whitespace-nowrap tabular-nums">{t.price(l.price, l.transaction ?? undefined)}</td>
                        <td className="px-3 whitespace-nowrap">
                          {l.listingAgentName ?? <span className="text-faint">{l.agentName ? t("Page names {name}", { name: l.agentName }) : t("None")}</span>}
                        </td>
                        <td className="px-3">
                          <ReadBy by={l.extractedBy} />
                        </td>
                        <td className="py-2 pr-4 pl-3 text-right">
                          <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg" aria-label={t("Open on your website")}>
                            <ExternalLink className="size-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </section>
          )}

          {status.failed.length > 0 && (
            <details className="mt-5">
              <summary className="flex cursor-pointer items-center gap-1.5 text-muted">
                <AlertTriangle className="size-3.5" />
                {status.failed.length === 1 ? t("1 page could not be read") : t("{n} pages could not be read", { n: status.failed.length })}
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-[12px] text-muted">
                {status.failed.slice(0, 50).map((f) => (
                  <li key={f.url} className="break-all">
                    {f.url} · {f.error}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {!sync.lastRunAt && (
            <p className="mt-5 flex items-start gap-1.5 text-[12px] text-faint">
              <Globe className="mt-0.5 size-3.5 shrink-0" />
              {t("We read your public pages like a search engine does: once a day, one page at a time, only on the address you give here and only where your robots.txt allows.")}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
