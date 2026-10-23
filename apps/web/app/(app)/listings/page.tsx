import Link from "next/link";
import { runTool, tools } from "@viewing/core";
import { Building2, CalendarDays, MessageSquare, Plus } from "lucide-react";
import { ListingPhoto } from "@/components/listing-photo";
import { Avatar, Button, EmptyState, PageHeader, StatusDot } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { address, formatPrice } from "@/lib/format";
import { listingStatusMeta, propertyTypeLabel } from "@/lib/labels";

export default async function ListingsPage() {
  const listings = await runTool(tools.listListings, await getToolContext(), {});

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Listings" }]}
        actions={
          <Button variant="primary" size="sm" disabled title="Coming with listing management">
            <Plus className="size-3.5" />
            New listing
          </Button>
        }
      />
      <div className="flex-1 overflow-auto">
        {listings.length === 0 ? (
          <EmptyState icon={<Building2 className="size-5" />} title="No listings yet" description="Listings imported from your website will appear here." />
        ) : (
          <table className="w-full min-w-[860px] text-left">
            <thead className="sticky top-0 z-10 bg-panel text-[12px] text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 pl-5 font-normal">Property</th>
                <th className="px-3 font-normal">Status</th>
                <th className="px-3 font-normal">Price</th>
                <th className="px-3 font-normal">Details</th>
                <th className="px-3 font-normal">Activity</th>
                <th className="py-2 pr-5 pl-3 font-normal">Agent</th>
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
                          {l.reference} · {propertyTypeLabel[l.propertyType] ?? l.propertyType} · {l.transaction === "rent" ? "For rent" : "For sale"}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-3">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <StatusDot color={listingStatusMeta[l.status].color} />
                      {listingStatusMeta[l.status].label}
                    </span>
                  </td>
                  <td className="px-3 whitespace-nowrap tabular-nums">{formatPrice(l.price, l.transaction)}</td>
                  <td className="px-3 whitespace-nowrap text-muted">
                    {[l.bedrooms != null && `${l.bedrooms} bd`, l.livingArea && `${l.livingArea} m²`, l.epcLabel && `EPC ${l.epcLabel}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                  <td className="px-3 whitespace-nowrap text-muted">
                    <span className="inline-flex items-center gap-3">
                      <span className="inline-flex items-center gap-1" title="Open leads">
                        <MessageSquare className="size-3.5" />
                        {l.openLeads}
                      </span>
                      <span className="inline-flex items-center gap-1" title="Upcoming viewings">
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
                      <span className="text-faint">Unassigned</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
