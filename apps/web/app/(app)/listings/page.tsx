import Link from "next/link";
import { runTool, tools } from "@viewing/core";
import { Building2, CalendarDays, Globe, MessageSquare } from "lucide-react";
import { ListingPhoto } from "@/components/listing-photo";
import { Avatar, EmptyState, PageHeader, StatusDot } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { address } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { listingStatusMeta, propertyTypeLabel } from "@/lib/labels";

export default async function ListingsPage() {
  const t = await getT();
  const listings = await runTool(tools.listListings, await getToolContext(), {});

  return (
    <>
      <PageHeader
        crumbs={[{ label: t("Listings") }]}
        actions={
          <Link href="/listings/website" className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-fg hover:opacity-90">
            <Globe className="size-3.5" />
            <span className="hidden sm:inline">{t("Import from website")}</span>
          </Link>
        }
      />
      <div className="flex-1 overflow-auto">
        {listings.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-5" />}
            title={t("No listings yet")}
            description={t("Give your website address and we read your listings from it, with their agents. They stay in sync every night.")}
            action={
              <Link href="/listings/website" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-fg hover:opacity-90">
                <Globe className="size-4" />
                {t("Import from your website")}
              </Link>
            }
          />
        ) : (
          <>
          <ul className="divide-y divide-line md:hidden">
            {listings.map((l) => (
              <li key={l.id}>
                <Link href={`/listings/${l.id}`} className="flex gap-3 px-4 py-3 active:bg-hover">
                  <ListingPhoto src={l.photo} alt={l.title ?? l.reference} className="h-16 w-20 shrink-0 rounded-md border border-line" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{address(l.street, l.houseNumber, l.city)}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                      <StatusDot color={listingStatusMeta[l.status].color} className="size-1.5" />
                      {t(listingStatusMeta[l.status].label)} · {t.price(l.price, l.transaction)}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[12px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="size-3.5" />
                        {l.openLeads}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" />
                        {l.upcomingViewings}
                      </span>
                      {l.agentName && (
                        <span className="ml-auto flex items-center gap-1.5">
                          <Avatar name={l.agentName} color={l.agentColor} size={18} />
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <table className="hidden w-full min-w-[860px] text-left md:table">
            <thead className="sticky top-0 z-10 bg-panel text-[12px] text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 pl-5 font-normal">{t("Property")}</th>
                <th className="px-3 font-normal">{t("Status")}</th>
                <th className="px-3 font-normal">{t("Price")}</th>
                <th className="px-3 font-normal">{t("Details")}</th>
                <th className="px-3 font-normal">{t("Activity")}</th>
                <th className="py-2 pr-5 pl-3 font-normal">{t("Agent")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {listings.map((l) => (
                <tr key={l.id} className="group hover:bg-hover/60">
                  <td className="py-2.5 pr-3 pl-5">
                    <Link href={`/listings/${l.id}`} className="flex items-center gap-3">
                      <ListingPhoto src={l.photo} alt={l.title ?? l.reference} className="h-10 w-14 shrink-0 rounded-md border border-line" />
                      <div className="min-w-0">
                        <div className="truncate font-medium group-hover:underline">{address(l.street, l.houseNumber, l.city)}</div>
                        <div className="truncate text-[12px] text-muted">
                          {l.reference} · {propertyTypeLabel[l.propertyType] ? t(propertyTypeLabel[l.propertyType]!) : l.propertyType} · {l.transaction === "rent" ? t("For rent") : t("For sale")}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-3">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <StatusDot color={listingStatusMeta[l.status].color} />
                      {t(listingStatusMeta[l.status].label)}
                    </span>
                  </td>
                  <td className="px-3 whitespace-nowrap tabular-nums">{t.price(l.price, l.transaction)}</td>
                  <td className="px-3 whitespace-nowrap text-muted">
                    {[l.bedrooms != null && t("{n} bd", { n: l.bedrooms }), l.livingArea && `${l.livingArea} m²`, l.epcLabel && `EPC ${l.epcLabel}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                  <td className="px-3 whitespace-nowrap text-muted">
                    <span className="inline-flex items-center gap-3">
                      <span className="inline-flex items-center gap-1" title={t("Open leads")}>
                        <MessageSquare className="size-3.5" />
                        {l.openLeads}
                      </span>
                      <span className="inline-flex items-center gap-1" title={t("Upcoming viewings")}>
                        <CalendarDays className="size-3.5" />
                        {l.upcomingViewings}
                      </span>
                    </span>
                  </td>
                  <td className="py-2.5 pr-5 pl-3">
                    {l.agentName ? (
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <Avatar name={l.agentName} color={l.agentColor} />
                        {l.agentName}
                      </span>
                    ) : (
                      <span className="text-faint">{t("Unassigned")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>
    </>
  );
}
