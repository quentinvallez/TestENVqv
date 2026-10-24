import { notFound } from "next/navigation";
import { runTool, tools } from "@viewing/core";
import { CalendarDays, FileText, ImagePlus, Megaphone, MessageSquare, NotebookPen, Sparkles } from "lucide-react";
import Link from "next/link";
import { CopyLinkButton } from "@/components/copy-link";
import { assignAgentAction } from "../../actions";
import { AgentPicker } from "./agent-picker";
import { ListingPhoto } from "@/components/listing-photo";
import { AiPill, Avatar, Button, EmptyState, PageHeader, Panel, Pill, StatusDot, Tabs } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { address, formatDateTime, formatPrice, formatRelative, fullName } from "@/lib/format";
import { appointmentStatusMeta, leadStageMeta, listingStatusMeta, propertyTypeLabel, sourceLabel } from "@/lib/labels";

const tabIds = ["viewings", "leads", "details", "advertising", "staging", "notes"] as const;
type TabId = (typeof tabIds)[number];

export default async function ListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: TabId = tabIds.includes(tabParam as TabId) ? (tabParam as TabId) : "viewings";
  const ctx = await getToolContext();
  const [listing, agents] = await Promise.all([runTool(tools.getListing, ctx, { id }), runTool(tools.listAgents, ctx, {})]);
  if (!listing) notFound();

  const base = `/listings/${listing.id}`;
  const street = address(listing.street, listing.houseNumber, listing.city);
  const bookable = listing.status === "active" || listing.status === "under_offer";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Listings", href: "/listings" }, { label: street || listing.reference }]}
        actions={
          bookable && (
            <>
              <CopyLinkButton path={`/book/${listing.id}`} label="Copy booking link" />
              <Link
                href={`/demo-site/${listing.agencyId}/${listing.id}`}
                target="_blank"
                className="hidden h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium hover:bg-hover sm:inline-flex"
              >
                See on demo website
              </Link>
              <Link
                href={`/book/${listing.id}`}
                target="_blank"
                className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-fg hover:opacity-90"
              >
                <span className="sm:hidden">Booking page</span>
                <span className="hidden sm:inline">Open booking page</span>
              </Link>
            </>
          )
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 border-b border-line px-5 py-5 sm:flex-row">
          <ListingPhoto src={listing.photos[0]?.url} alt={listing.title ?? listing.reference} className="h-32 w-full shrink-0 rounded-lg border border-line sm:w-48" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>{listing.reference}</Pill>
              <Pill>
                <StatusDot color={listingStatusMeta[listing.status].color} className="size-1.5" />
                {listingStatusMeta[listing.status].label}
              </Pill>
              <Pill>{listing.transaction === "rent" ? "For rent" : "For sale"}</Pill>
            </div>
            <h1 className="mt-2 text-[20px] font-semibold tracking-tight">{listing.title ?? street}</h1>
            <p className="text-muted">{[street, listing.postcode].filter(Boolean).join(" · ")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-muted">
              <span className="text-[15px] font-medium text-fg tabular-nums">{formatPrice(listing.price, listing.transaction)}</span>
              <span>{propertyTypeLabel[listing.propertyType] ?? listing.propertyType}</span>
              {listing.bedrooms != null && <span>{listing.bedrooms} bedrooms</span>}
              {listing.livingArea && <span>{listing.livingArea} m²</span>}
              {listing.epcLabel && <span>EPC {listing.epcLabel}</span>}
            </div>
          </div>
          <div className="shrink-0 border-t border-line pt-4 sm:w-56 sm:border-0 sm:pt-0">
            <div className="text-[12px] text-muted">Responsible agent</div>
            <AgentPicker
              agents={agents.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name, color: a.color, office: a.officeName }))}
              currentId={listing.agentId}
              action={assignAgentAction.bind(null, listing.id)}
            />
          </div>
        </div>

        <Tabs
          active={tab}
          tabs={[
            { id: "viewings", label: `Viewings · ${listing.appointments.length}`, href: base, icon: <CalendarDays className="size-3.5" /> },
            { id: "leads", label: `Leads · ${listing.leads.length}`, href: `${base}?tab=leads`, icon: <MessageSquare className="size-3.5" /> },
            { id: "details", label: "Details", href: `${base}?tab=details`, icon: <FileText className="size-3.5" /> },
            { id: "advertising", label: "Advertising", href: `${base}?tab=advertising`, icon: <Megaphone className="size-3.5" /> },
            { id: "staging", label: "AI staging", href: `${base}?tab=staging`, icon: <Sparkles className="size-3.5" />, ai: true },
            { id: "notes", label: "Notes", href: `${base}?tab=notes`, icon: <NotebookPen className="size-3.5" /> },
          ]}
        />

        <div className="px-5 py-5">
          {tab === "viewings" && (
            <Panel className="divide-y divide-line">
              {listing.appointments.length === 0 && (
                <EmptyState icon={<CalendarDays className="size-5" />} title="No viewings yet" description="Viewings booked through the widget or the planner appear here." />
              )}
              {listing.appointments.map((apt) => (
                <div key={apt.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-[150px] shrink-0 tabular-nums">{formatDateTime(apt.startsAt)}</div>
                  <div className="min-w-0 flex-1 truncate font-medium">{fullName(apt.contact?.firstName, apt.contact?.lastName)}</div>
                  <span className="flex items-center gap-1.5 text-[12px] text-muted">
                    <StatusDot color={appointmentStatusMeta[apt.status].color} />
                    {appointmentStatusMeta[apt.status].label}
                  </span>
                  <Avatar name={apt.agent.name} color={apt.agent.color} />
                </div>
              ))}
            </Panel>
          )}

          {tab === "leads" && (
            <Panel className="divide-y divide-line">
              {listing.leads.length === 0 && <EmptyState icon={<MessageSquare className="size-5" />} title="No leads yet" description="Portal and website requests for this listing appear here." />}
              {listing.leads.map((lead) => (
                <div key={lead.id} className="flex items-start gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fullName(lead.contact.firstName, lead.contact.lastName)}</span>
                      <Pill>{sourceLabel[lead.source]}</Pill>
                    </div>
                    {lead.message && <p className="mt-0.5 line-clamp-2 text-muted">{lead.message}</p>}
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
                    <StatusDot color={leadStageMeta[lead.stage].color} />
                    {leadStageMeta[lead.stage].label}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[12px] text-faint">{formatRelative(lead.createdAt)}</span>
                </div>
              ))}
            </Panel>
          )}

          {tab === "details" && (
            <Panel className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2">
              {[
                ["Reference", listing.reference],
                ["Type", propertyTypeLabel[listing.propertyType] ?? listing.propertyType],
                ["Transaction", listing.transaction === "rent" ? "Rent" : "Sale"],
                ["Price", formatPrice(listing.price, listing.transaction)],
                ["Bedrooms", listing.bedrooms],
                ["Bathrooms", listing.bathrooms],
                ["Living area", listing.livingArea && `${listing.livingArea} m²`],
                ["Plot area", listing.plotArea && `${listing.plotArea} m²`],
                ["EPC", listing.epcLabel && `${listing.epcLabel} · ${listing.epcScore} kWh/m²`],
                ["Immoweb ID", listing.portalRefs.immoweb],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-4 border-b border-line pb-2.5">
                  <span className="text-muted">{label}</span>
                  <span className="text-right">{value ?? "—"}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1 sm:col-span-2">
                <AiPill>Coming soon</AiPill>
                <span className="text-muted">Characteristics filled in automatically from photos, plans and the EPC certificate.</span>
              </div>
            </Panel>
          )}

          {tab === "advertising" && (
            <EmptyState
              icon={<Megaphone className="size-5" />}
              title="Publish everywhere from one place"
              description="Post this listing to your website, Immoweb, Zimmo and social media, with an AI-written description in NL, FR and EN."
              action={<AiPill>On the roadmap</AiPill>}
            />
          )}
          {tab === "staging" && (
            <EmptyState
              icon={<ImagePlus className="size-5" />}
              title="Virtual staging"
              description="Turn empty rooms into furnished ones in a few clicks, clearly labelled as virtually staged."
              action={<AiPill>On the roadmap</AiPill>}
            />
          )}
          {tab === "notes" && (
            <EmptyState
              icon={<NotebookPen className="size-5" />}
              title="AI notetaker"
              description="Record the intake visit with the owner. Notes, characteristics and to-dos are filled in for you."
              action={<Button variant="ai" size="sm" disabled><Sparkles className="size-3.5" />On the roadmap</Button>}
            />
          )}
        </div>
      </div>
    </>
  );
}
