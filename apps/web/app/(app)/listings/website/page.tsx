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

export const dynamic = "force-dynamic";
// The import runs inside the server action of this page.
export const maxDuration = 60;

function ReadBy({ by }: { by: string | null }) {
  if (by === "ai") return <AiPill>Read by Claude</AiPill>;
  return <Pill>{by === "structured" ? "Page data" : "Rules"}</Pill>;
}

/** What the pages we found on the site turned out to be, as one thin bar with a legend. */
function PageBreakdown({ counts }: { counts: { listing: number; offMarket: number; pending: number; gone: number; other: number; error: number } }) {
  const parts = [
    { label: "listings", value: counts.listing, className: "bg-fg" },
    { label: "sold, rented or under option (not listed)", value: counts.offMarket, className: "bg-muted" },
    { label: "to read", value: counts.pending, className: "bg-line-strong" },
    { label: "taken offline", value: counts.gone, className: "bg-faint" },
    { label: "not a listing", value: counts.other, className: "bg-line" },
    { label: "could not be read", value: counts.error, className: "bg-danger" },
  ].filter((p) => p.value > 0);
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (!total) return null;
  return (
    <div className="mt-3">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-hover" aria-hidden>
        {parts.map((p) => (
          <div key={p.label} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
        <span>{total} pages found:</span>
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5 tabular-nums">
            <span className={`size-1.5 rounded-full ${p.className}`} />
            {p.value} {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

type Overview = Awaited<ReturnType<typeof tools.websiteImportStatus.run>>["overviews"][number];

const cardParts = [
  { key: "onOffer", label: "on offer", className: "bg-fg" },
  { key: "underOffer", label: "under option", className: "bg-muted" },
  { key: "soldOrRented", label: "sold or rented", className: "bg-faint" },
  { key: "toRead", label: "to read", className: "bg-line-strong" },
  { key: "offline", label: "taken offline", className: "bg-line" },
  { key: "notListing", label: "not a listing", className: "bg-line" },
  { key: "failed", label: "could not be read", className: "bg-danger" },
] as const;

const viaLabel: Record<Overview["via"], string> = {
  single: "one page",
  links: "through its page links",
  form: "through its search form",
  guess: "page by page",
  browser: "read with a browser, scrolling",
};

/** One overview of the site (for sale, for rent, new builds): what it says it has, what we found, and what those turned out to be. */
function OverviewRow({ overview: o }: { overview: Overview }) {
  const url = new URL(o.url);
  const parts = cardParts.map((p) => ({ ...p, value: o.counts[p.key] })).filter((p) => p.value > 0);
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const missing = o.stated != null ? Math.max(0, o.stated - o.found) : 0;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <a href={o.url} target="_blank" rel="noreferrer" className="min-w-0 truncate font-medium hover:underline">
          {decodeURIComponent(url.pathname + url.search)}
        </a>
        <span className="flex items-center gap-1.5 tabular-nums">
          {o.stated != null ? (
            <>
              <StatusDot color={missing ? "var(--warning)" : "var(--success)"} className="size-1.5" />
              {missing ? `${o.found} of ${o.stated} found` : `${o.stated} on your site, all found`}
            </>
          ) : (
            <span className="text-muted">{o.found} found; the page shows no total</span>
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
                {p.value} {p.label}
              </span>
            ))}
          </div>
        </>
      )}
      <div className="mt-1 text-[12px] text-faint">
        {viaLabel[o.via]}, {o.pages} {o.pages === 1 ? "page" : "pages"}
        {!o.complete && "; still going through it"}
        {o.complete && missing > 0 && `; ${missing} ${missing === 1 ? "card" : "cards"} we couldn't reach. Paste the link of a missing listing below.`}
      </div>
    </li>
  );
}

export default async function WebsiteImportPage() {
  const status = await runTool(tools.websiteImportStatus, await getToolContext(), {});
  const { sync } = status;
  const host = status.websiteUrl ? new URL(status.websiteUrl).host : null;

  return (
    <>
      <PageHeader crumbs={[{ label: "Listings", href: "/listings" }, { label: "From your website" }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-4 py-6 md:px-5">
          <h1 className="text-[18px] font-semibold tracking-tight">Your listings, read from your website</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Give your website address and we find every listing on it, with its price, address, details, photos and the agent the page names. Every
            night we read it again: new listings appear, price and status changes follow, and listings you take off your site are archived here.
          </p>

          <Panel className="mt-5 p-4">
            <ImportForm action={importWebsiteAction} websiteUrl={status.websiteUrl} label={status.websiteUrl ? "Check again now" : "Import listings"} />
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-faint">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" />
              {status.aiAvailable
                ? "Most pages are read by rules. When a page is laid out in a way they don't understand, Claude reads it; those listings are marked."
                : "Pages are read by rules. With Claude connected, pages the rules don't fully understand would be read by Claude."}
            </p>
          </Panel>

          {sync.lastRunAt && (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Listings read" value={sync.found ?? 0} hint={sync.pages ? `of ${sync.pages} listing pages found` : (host ?? undefined)} />
                <Stat label="New in last run" value={sync.created ?? 0} />
                <Stat label="Checked or updated" value={sync.updated ?? 0} />
                <Stat label="Removed from site" value={sync.removed ?? 0} hint="Archived here" />
              </div>
              <p className="mt-2 text-[12px] text-muted">
                Last read {formatRelative(new Date(sync.lastRunAt))}.
                {(sync.remaining ?? 0) > 0 && ` ${sync.remaining} pages still to read; the next run continues with them.`}
                {sync.error && <span className="text-danger"> {sync.error}</span>}
              </p>
              <PageBreakdown counts={status.pageCounts} />
              {status.overviews.length > 0 && (
                <section className="mt-5">
                  <h2 className="font-medium">What your website shows</h2>
                  <p className="mt-0.5 max-w-2xl text-[12px] text-muted">
                    Each overview on your site, with the number it shows next to what we found on it. That number often counts listings under option or
                    sold too: only listings on offer go to your listings and the planner.
                  </p>
                  <Panel className="mt-2">
                    <ul className="divide-y divide-line">
                      {status.overviews.map((o) => (
                        <OverviewRow key={o.url} overview={o} />
                      ))}
                    </ul>
                  </Panel>
                  {status.searching && <p className="mt-2 text-[12px] text-muted">We are still going through your overview pages; the next run continues.</p>}
                </section>
              )}
              <Panel className="mt-3 p-4">
                <div className="font-medium">A listing missing?</div>
                <p className="mt-0.5 mb-2 text-[12px] text-muted">Paste its link from your website. We read it right away, and note that our search missed it.</p>
                <MissingListingForm action={importMissingListingAction} />
              </Panel>
              {((sync.blocked ?? 0) > 0 || (sync.crawlDelay ?? 0) > 1) && (
                <p className="mt-2 max-w-2xl text-[12px] text-muted">
                  We follow your website&apos;s robots.txt.
                  {(sync.blocked ?? 0) > 0 && ` It doesn't allow crawlers on ${sync.blocked} listing ${sync.blocked === 1 ? "page" : "pages"}, so we leave ${sync.blocked === 1 ? "it" : "them"} out.`}
                  {(sync.crawlDelay ?? 0) > 1 && ` It asks for ${sync.crawlDelay} seconds between pages, so a full read takes several nights.`} To let us read all
                  listings at a normal pace, add these two lines to it:{" "}
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
                  {status.websiteAgents.length} {status.websiteAgents.length === 1 ? "agent" : "agents"} added from your website
                </div>
                <p className="mt-0.5 text-muted">
                  {status.websiteAgents.map((a) => a.name).join(", ")}. Their listings take bookings from Monday to Friday, 9:00 to 18:00. Check their hours and
                  email in{" "}
                  <Link href="/agents" className="text-fg underline underline-offset-2">
                    Agents
                  </Link>
                  .
                </p>
              </div>
            </Panel>
          )}

          {(status.withoutAgent > 0 || status.unknownAgents.length > 0) && (
            <Panel className="mt-5 flex items-start gap-3 p-4">
              <UserRound className="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <div className="font-medium">
                  {status.withoutAgent} {status.withoutAgent === 1 ? "listing has" : "listings have"} no agent yet
                </div>
                <p className="mt-0.5 text-muted">
                  {status.unknownAgents.length > 0
                    ? `Your website names ${status.unknownAgents.join(", ")}, who ${status.unknownAgents.length === 1 ? "isn't an agent" : "aren't agents"} here yet. Until then, open the listing to pick the agent whose calendar takes the bookings.`
                    : "Open the listing to pick the agent whose calendar takes the bookings."}
                </p>
              </div>
            </Panel>
          )}

          {status.listings.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 font-medium">Imported listings</h2>
              <Panel className="overflow-hidden">
                <ul className="divide-y divide-line md:hidden">
                  {status.listings.map((l) => (
                    <li key={l.url}>
                      <Link href={`/listings/${l.listingId}`} className="flex gap-3 px-4 py-3 active:bg-hover">
                        <ListingPhoto src={l.photo} alt={l.title ?? l.reference ?? ""} className="h-16 w-20 shrink-0 rounded-md border border-line" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{address(l.street, l.houseNumber, l.city) || l.title}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                            {l.status && <StatusDot color={listingStatusMeta[l.status].color} className="size-1.5" />}
                            {l.status && listingStatusMeta[l.status].label} · {formatPrice(l.price, l.transaction ?? undefined)}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                            <ReadBy by={l.extractedBy} />
                            <span className="truncate">{l.listingAgentName ?? (l.agentName ? `Page names ${l.agentName}` : "No agent")}</span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                <table className="hidden w-full text-left md:table">
                  <thead className="bg-panel text-[12px] text-muted">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-3 pl-4 font-normal">Property</th>
                      <th className="px-3 font-normal">Status</th>
                      <th className="px-3 font-normal">Price</th>
                      <th className="px-3 font-normal">Agent</th>
                      <th className="px-3 font-normal">Read by</th>
                      <th className="py-2 pr-4 pl-3 font-normal">
                        <span className="sr-only">Page</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {status.listings.map((l) => (
                      <tr key={l.url} className="group hover:bg-hover/60">
                        <td className="py-2 pr-3 pl-4">
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
                              {listingStatusMeta[l.status].label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 whitespace-nowrap tabular-nums">{formatPrice(l.price, l.transaction ?? undefined)}</td>
                        <td className="px-3 whitespace-nowrap">
                          {l.listingAgentName ?? <span className="text-faint">{l.agentName ? `Page names ${l.agentName}` : "None"}</span>}
                        </td>
                        <td className="px-3">
                          <ReadBy by={l.extractedBy} />
                        </td>
                        <td className="py-2 pr-4 pl-3 text-right">
                          <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg" aria-label="Open on your website">
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
                {status.failed.length} {status.failed.length === 1 ? "page" : "pages"} could not be read
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
              We read your public pages like a search engine does: once a day, one page at a time, only on the address you give here and only where your robots.txt allows.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
