import { headers } from "next/headers";
import Link from "next/link";
import { runTool, tools } from "@viewing/core";
import { CalendarPlus, Code2, ExternalLink, House, ListChecks, Sparkles } from "lucide-react";
import { SettingsTabs } from "@/components/settings-tabs";
import { Button, PageHeader, Panel, StatusDot } from "@/components/ui";
import { getSession, getToolContext } from "@/lib/context";
import { address, formatDateTime } from "@/lib/format";
import { ImportForm } from "../listings/website/import-form";
import { setBookingLauncherAction, setValuationLauncherAction, setupWebsiteAction } from "../actions";
import { Install } from "./install";
import { getT } from "@/lib/i18n/server";

export default async function WidgetPage({ searchParams }: { searchParams: Promise<{ website?: string }> }) {
  const t = await getT();
  // A new workspace arrives with the website given in its request, ready to read.
  const { website } = await searchParams;
  const { agency } = await getSession();
  const h = await headers();
  const appOrigin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const ctx = await getToolContext();
  const [listings, widget] = await Promise.all([runTool(tools.listListings, ctx, { status: "active" }), runTool(tools.getWidgetSettings, ctx, {})]);
  const first = listings[0];
  const snippet = `<script src="${appOrigin}/widget.js" data-agency="${agency.id}" async></script>`;
  const seen = widget.seen;

  return (
    <>
      <PageHeader crumbs={[{ label: t("Settings"), href: "/settings" }, { label: t("Website & widget") }]} />
      <SettingsTabs active="widget" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] px-5 py-6">
          <h1 className="text-[18px] font-semibold tracking-tight">{t("The planner on your website")}</h1>
          <p className="mt-1 max-w-2xl text-muted">
            {t("Two steps: tell us your website, then put one line on it. Visitors then book viewings on your listing pages and owners ask for a valuation on every other page.")}
          </p>

          <Panel className="mt-5 p-4">
            <Step n={1} done={Boolean(widget.websiteUrl && listings.length)} title={t("Your website")} />
            <p className="mt-1 mb-3 text-muted">
              {t("We read your listings from it, with their status and agent, and keep them up to date every night. We also take your colour from it for the buttons.")}
            </p>
            <ImportForm action={setupWebsiteAction} websiteUrl={widget.websiteUrl ?? website?.slice(0, 300) ?? null} label={widget.websiteUrl ? t("Read again") : t("Read my website")} />
            {widget.websiteUrl && (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                <Link href="/listings/website" className="underline underline-offset-2">
                  {t("{n} listings on offer · see what we found", { n: listings.length })}
                </Link>
                {widget.brandColor && (
                  <Link href="/settings#colour" className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                    <span className="size-3 rounded-full border border-line" style={{ background: widget.brandColor }} />
                    {widget.colourChosen ? t("Button colour {colour} (yours) · change", { colour: widget.brandColor }) : t("Button colour {colour} · change", { colour: widget.brandColor })}
                  </Link>
                )}
              </p>
            )}
          </Panel>

          <Panel className="mt-3 p-4">
            <Step n={2} done={Boolean(seen?.onWebsite)} title={t("Put this line on your website")} />
            <p className="mt-1 mb-3 text-muted">{t("Once, on every page. Nothing to change per listing: we recognise listing pages by their address.")}</p>
            <Install snippet={snippet} agencyName={agency.name} builder={widget.siteBuilder} />
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <StatusDot color={seen?.onWebsite ? "var(--success)" : seen ? "var(--warning)" : "var(--line-strong)"} />
              {seen?.onWebsite ? (
                <span>
                  {t("Installed on your website · last seen {when} on", { when: t.dateTime(new Date(seen.lastAt)) })}{" "}
                  <a href={seen.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {new URL(seen.url).pathname}
                  </a>
                </span>
              ) : seen ? (
                <span>
                  {widget.websiteUrl
                    ? t("Seen on {host}, which isn't your website address ({own}). Booking buttons only show on your own website.", { host: new URL(seen.url).host, own: new URL(widget.websiteUrl).host })
                    : t("Seen on {host}, which isn't your website address. Booking buttons only show on your own website.", { host: new URL(seen.url).host })}
                </span>
              ) : (
                <span className="text-muted">{t("Not seen on your website yet. Open any page of your site after adding the line, then come back.")}</span>
              )}
              <Link href="/widget" className="ml-auto text-[12px] text-muted underline underline-offset-2">
                {t("Check again")}
              </Link>
            </div>
          </Panel>

          <h2 className="mt-8 text-[14px] font-semibold">{t("Try it and fine-tune")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Link href={`/demo-site/${agency.id}`} target="_blank" className="group">
              <Panel className="h-full p-4 transition-colors group-hover:border-line-strong">
                <div className="flex items-center gap-2 font-medium">
                  <ExternalLink className="size-4 text-muted" />
                  {t("Open the demo agency website")}
                </div>
                <p className="mt-1 text-muted">{t("Your listings on a sample agency site, with the widget on every listing page.")}</p>
              </Panel>
            </Link>
            <Link href={`/demo-site/${agency.id}/verkopen`} target="_blank" className="group">
              <Panel className="h-full p-4 transition-colors group-hover:border-line-strong">
                <div className="flex items-center gap-2 font-medium">
                  <ExternalLink className="size-4 text-muted" />
                  {t("Home valuation")}
                </div>
                <p className="mt-1 text-muted">{t("Owners estimate their home; you get a verified seller lead and a drafted reply to approve.")}</p>
              </Panel>
            </Link>
            {first && (
              <Link href={`/demo-site/${agency.id}/${first.id}?lang=fr`} target="_blank" className="group">
                <Panel className="h-full p-4 transition-colors group-hover:border-line-strong">
                  <div className="flex items-center gap-2 font-medium">
                    <ExternalLink className="size-4 text-muted" />
                    {t("Try it in French")}
                  </div>
                  <p className="mt-1 text-muted">{address(first.street, first.houseNumber, first.city)} · {t("the widget speaks NL, FR and EN.")}</p>
                </Panel>
              </Link>
            )}
          </div>

          <Panel className="mt-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-medium">
                <CalendarPlus className="size-4 text-muted" />
                {t("Booking on listing pages, found automatically")}
                <StatusDot color={widget.bookingLauncher ? "var(--success)" : "var(--line-strong)"} />
                <span className="text-[12px] font-normal text-muted">{widget.bookingLauncher ? t("On") : t("Off")}</span>
              </div>
              <p className="mt-1 max-w-xl text-muted">
                {t.rich(
                  "With your listings <a>imported from your website</a>, the script recognises each listing page and shows a \"Plan een bezoek\" button there, in your colour, instead of the valuation button. No change to your listing pages needed; a placeholder on the page takes precedence.",
                  { a: (c) => <Link href="/listings/website" className="underline underline-offset-2">{c}</Link> },
                )}
              </p>
            </div>
            <form action={setBookingLauncherAction.bind(null, !widget.bookingLauncher)}>
              <Button type="submit">{widget.bookingLauncher ? t("Turn off") : t("Turn on")}</Button>
            </form>
          </Panel>

          <Panel className="mt-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-medium">
                <House className="size-4 text-muted" />
                {t("Valuation button on every page")}
                <StatusDot color={widget.valuationLauncher ? "var(--success)" : "var(--line-strong)"} />
                <span className="text-[12px] font-normal text-muted">{widget.valuationLauncher ? t("On") : t("Off")}</span>
              </div>
              <p className="mt-1 max-w-xl text-muted">
                {t("A \"Gratis schatting\" button at the bottom right of every page with the script, in your colour. It opens the valuation in a panel, full screen on phones. Hidden on pages that already show the valuation.")}
              </p>
            </div>
            <form action={setValuationLauncherAction.bind(null, !widget.valuationLauncher)}>
              <Button type="submit">{widget.valuationLauncher ? t("Turn off") : t("Turn on")}</Button>
            </form>
          </Panel>

          <Panel className="mt-5 p-4">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <ListChecks className="size-4 text-muted" />
              {t("Qualifying questions")}
            </div>
            <p className="text-muted">
              {t("Asked after the visitor picks a time, and optional to answer. The answers show on the lead and the contact, with a hot / warm / cold label, so agents know who they meet.")}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[12px] font-medium text-muted">{t("For sale")}</div>
                <ul className="mt-1 list-inside list-disc text-muted">
                  <li>{t("Living in it or investing")}</li>
                  <li>{t("Mortgage approval")}</li>
                  <li>{t("Selling a current home first")}</li>
                  <li>{t("When they want to buy")}</li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-medium text-muted">{t("For rent")}</div>
                <ul className="mt-1 list-inside list-disc text-muted">
                  <li>{t("Move-in date")}</li>
                  <li>{t("Number of people")}</li>
                  <li>{t("Pets")}</li>
                </ul>
                <p className="mt-1 text-[12px] text-faint">{t("Kept within what Belgian anti-discrimination rules allow before a viewing.")}</p>
              </div>
            </div>
          </Panel>

          <Panel className="mt-5 p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
              <Code2 className="size-3.5" />
              {t("Optional placeholders")}
            </div>
            <pre className="overflow-x-auto rounded-md bg-hover p-3 font-mono text-[12px] text-muted">
              {`<!-- Optional, to place booking inside a listing page yourself, with the listing's reference -->\n<div data-viewing-widget data-listing="ANT-1042"></div>\n\n<!-- Optional, on your "Sell" page: the valuation in the page itself -->\n<div data-viewing-valuation></div>`}
            </pre>
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-faint">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" />
              {t("The script reads the agent's name on the page (for example \"Uw makelaar: Sofie Peeters\") and books in that agent's calendar. If no agent name is found, it uses the responsible agent set on the listing here.")}
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Step({ n, done, title }: { n: number; done: boolean; title: string }) {
  return (
    <div className="flex items-center gap-2 font-medium">
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] ${done ? "bg-success text-white" : "border border-line-strong text-muted"}`}
        aria-hidden
      >
        {done ? "✓" : n}
      </span>
      {title}
      {done && <span className="sr-only">✓</span>}
    </div>
  );
}
