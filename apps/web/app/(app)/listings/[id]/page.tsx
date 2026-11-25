import { notFound } from "next/navigation";
import { runTool, tools } from "@viewing/core";
import { CalendarDays, ExternalLink, FileText, ImagePlus, KeyRound, Megaphone, MessageSquare, NotebookPen, Sparkles } from "lucide-react";
import Link from "next/link";
import { BookingAnswers } from "@/components/booking-answers";
import { CopyLinkButton } from "@/components/copy-link";
import { addOccupantAction, assignAgentAction, cancelOpenHouseAction, planOpenHouseAction, setListingAccessAction, suggestToMatchesAction, updateOccupantAction } from "../../actions";
import { OccupantForm } from "./occupant-form";
import { OpenHouseForm } from "./open-house-form";
import { AgentPicker } from "./agent-picker";
import { ListingPhoto } from "@/components/listing-photo";
import { AiPill, Avatar, Button, EmptyState, PageHeader, Panel, Pill, StatusDot, Tabs } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { address, formatDateTime, formatDay, formatPrice, formatRelative, formatTime, fullName } from "@/lib/format";
import { appointmentStatusMeta, leadStageMeta, listingStatusMeta, propertyTypeLabel, sourceLabel } from "@/lib/labels";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n";

const tabIds = ["viewings", "owner", "leads", "details", "advertising", "staging", "notes"] as const;

const weekdayNames = [msg("Sun"), msg("Mon"), msg("Tue"), msg("Wed"), msg("Thu"), msg("Fri"), msg("Sat")];
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const accessLabel = { agent: msg("The agency has the key"), owner: msg("Lived in by the owner"), tenant: msg("Rented out, tenant lives there") } as const;
type TabId = (typeof tabIds)[number];

export default async function ListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; openHouseCancelled?: string; told?: string }> }) {
  const t = await getT();
  const { id } = await params;
  const { tab: tabParam, openHouseCancelled, told } = await searchParams;
  const tab: TabId = tabIds.includes(tabParam as TabId) ? (tabParam as TabId) : "viewings";
  const ctx = await getToolContext();
  const [listing, agents, matches] = await Promise.all([
    runTool(tools.getListing, ctx, { id }),
    runTool(tools.listAgents, ctx, {}),
    runTool(tools.findMatchingClients, ctx, { listingId: id }),
  ]);
  if (!listing) notFound();
  const occupancy = tab === "owner" ? await runTool(tools.listListingOccupants, ctx, { listingId: listing.id }) : null;
  const booking = await runTool(tools.listingBookingLink, ctx, { id: listing.id });
  const openHouses = tab === "viewings" && listing.status === "active" ? await runTool(tools.listOpenHouses, ctx, { listingId: listing.id }) : [];

  const base = `/listings/${listing.id}`;
  const street = address(listing.street, listing.houseNumber, listing.city);
  const bookable = listing.status === "active";

  return (
    <>
      <PageHeader
        crumbs={[{ label: t("Listings"), href: "/listings" }, { label: street || listing.reference }]}
        actions={
          bookable && (
            <>
              <Link
                href={`/appointments/new?listingId=${listing.id}`}
                className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium hover:bg-hover"
              >
                <span className="sm:hidden">{t("Book")}</span>
                <span className="hidden sm:inline">{t("Book for a client")}</span>
              </Link>
              <CopyLinkButton path={booking.url} label={t("Copy booking link")} />
              {booking.onWebsite ? (
                <a
                  href={booking.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-fg hover:opacity-90"
                >
                  <span className="sm:hidden">{t("Website")}</span>
                  <span className="hidden sm:inline">{t("See on website")}</span>
                </a>
              ) : (
                <>
                  <Link
                    href={`/demo-site/${listing.agencyId}/${listing.id}`}
                    target="_blank"
                    className="hidden h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium hover:bg-hover sm:inline-flex"
                  >
                    {t("See on demo website")}
                  </Link>
                  <Link
                    href={`/book/${listing.id}`}
                    target="_blank"
                    className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-fg hover:opacity-90"
                  >
                    <span className="sm:hidden">{t("Booking page")}</span>
                    <span className="hidden sm:inline">{t("Open booking page")}</span>
                  </Link>
                </>
              )}
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
                {t(listingStatusMeta[listing.status].label)}
              </Pill>
              <Pill>{listing.transaction === "rent" ? t("For rent") : t("For sale")}</Pill>
              {listing.websiteUrl && (
                <a href={listing.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex h-5 items-center gap-1 rounded border border-line px-1.5 text-[11px] font-medium text-muted hover:text-fg">
                  <ExternalLink className="size-3" />
                  {listing.features?.source === "website" ? t("From your website") : t("On your website")}
                </a>
              )}
            </div>
            <h1 className="mt-2 text-[20px] font-semibold tracking-tight">{listing.title ?? street}</h1>
            <p className="text-muted">{[street, listing.postcode].filter(Boolean).join(" · ")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-muted">
              <span className="text-[15px] font-medium text-fg tabular-nums">{t.price(listing.price, listing.transaction)}</span>
              <span>{propertyTypeLabel[listing.propertyType] ? t(propertyTypeLabel[listing.propertyType]!) : listing.propertyType}</span>
              {listing.bedrooms != null && <span>{t("{n} bedrooms", { n: listing.bedrooms })}</span>}
              {listing.livingArea && <span>{listing.livingArea} m²</span>}
              {listing.epcLabel && <span>EPC {listing.epcLabel}</span>}
            </div>
          </div>
          <div className="shrink-0 border-t border-line pt-4 sm:w-56 sm:border-0 sm:pt-0">
            <div className="text-[12px] text-muted">{t("Responsible agent")}</div>
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
            { id: "viewings", label: `${t("Viewings")} · ${listing.appointments.length}`, href: base, icon: <CalendarDays className="size-3.5" /> },
            { id: "owner", label: t("Owner"), href: `${base}?tab=owner`, icon: <KeyRound className="size-3.5" /> },
            { id: "leads", label: `${t("Leads")} · ${listing.leads.length}`, href: `${base}?tab=leads`, icon: <MessageSquare className="size-3.5" /> },
            { id: "details", label: t("Details"), href: `${base}?tab=details`, icon: <FileText className="size-3.5" /> },
            { id: "advertising", label: t("Advertising"), href: `${base}?tab=advertising`, icon: <Megaphone className="size-3.5" /> },
            { id: "staging", label: t("AI staging"), href: `${base}?tab=staging`, icon: <Sparkles className="size-3.5" />, ai: true },
            { id: "notes", label: t("Notes"), href: `${base}?tab=notes`, icon: <NotebookPen className="size-3.5" /> },
          ]}
        />

        <div className="px-5 py-5">
          {tab === "viewings" && bookable && (
            <Panel className="mb-4">
              <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{t("Open house")}</div>
                  <p className="mt-0.5 text-[12px] text-muted">{t("One block of time at the house with room for many visitors, booked in short time slots on your website, the booking link and in the times the planner offers.")}</p>
                </div>
              </div>
              {openHouseCancelled && (
                <p className="border-b border-line px-4 py-2.5 text-[12px]">
                  {t("Open house cancelled. {told} of {total} visitors were told", { told: Number(told) || 0, total: Number(openHouseCancelled) || 0 })}
                  {Number(told) < Number(openHouseCancelled) ? t("; call the others yourself.") : "."}
                </p>
              )}
              {openHouses.map((o) => (
                <div key={o.id} className="border-b border-line px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium tabular-nums">
                      {t.day(o.startsAt)} · {t.time(o.startsAt)}–{t.time(o.endsAt)}
                    </span>
                    <span className="text-[12px] text-muted">
                      {o.slotMinutes ? t("{n} per {minutes} min", { n: o.perSlot, minutes: o.slotMinutes }) : t("come any time")} · {t("{booked} of {capacity} booked", { booked: o.booked, capacity: o.capacity })}
                      {o.exclusive ? ` · ${t("only this is offered")}` : ""}
                    </span>
                    <span className="flex items-center gap-1.5 text-[12px] text-muted">
                      <Avatar name={o.agent.name} color={o.agent.color} size={16} />
                      {o.agent.name}
                    </span>
                    {o.booked === 0 && (
                      <form action={cancelOpenHouseAction.bind(null, listing.id, o.id)} className="ml-auto">
                        <button className="py-1 text-[12px] text-muted hover:text-danger">{t("Cancel")}</button>
                      </form>
                    )}
                  </div>
                  {o.booked > 0 && (() => {
                    const upcoming = o.visitors.filter((v) => v.status === "scheduled" || v.status === "confirmed");
                    const toCall = upcoming.filter((v) => !v.email && !(v.whatsappOptIn && v.phone));
                    return (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[12px] text-muted">{t("Cancel this open house")}</summary>
                        <form action={cancelOpenHouseAction.bind(null, listing.id, o.id)} className="mt-2 rounded-md border border-line p-3">
                          <input type="hidden" name="notifyVisitors" value="on" />
                          <p className="text-[12px]">
                            {upcoming.length === 1
                              ? t("This cancels the place of the visitor and tells them by email or WhatsApp, with other free times and the booking link.")
                              : t("This cancels the places of all {n} visitors and tells each of them by email or WhatsApp, with other free times and the booking link.", { n: upcoming.length })}
                          </p>
                          {toCall.length > 0 && (
                            <p className="mt-2 text-[12px] text-muted">
                              {t(toCall.length === 1 ? msg("Call this visitor yourself, they left only a phone number: {names}.") : msg("Call these visitors yourself, they left only a phone number: {names}."), {
                                names: toCall.map((v) => `${fullName(v.firstName, v.lastName)}${v.phone ? ` (${v.phone})` : ""}`).join(", "),
                              })}
                            </p>
                          )}
                          <button className="mt-3 inline-flex h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium text-danger hover:bg-hover">
                            {t("Cancel and tell the visitors")}
                          </button>
                        </form>
                      </details>
                    );
                  })()}
                  {o.note && <p className="mt-1 text-[12px] text-muted">{o.note}</p>}
                  {o.visitors.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[12px] text-muted">{t("Visitor list ({n})", { n: o.visitors.length })}</summary>
                      <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                        {o.visitors.map((v) => (
                          <li key={v.appointmentId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                            <span className="w-12 tabular-nums">{t.time(v.startsAt)}</span>
                            <Link href={`/contacts/${v.contactId}`} className="font-medium hover:underline">
                              {fullName(v.firstName, v.lastName)}
                            </Link>
                            <span className="text-[12px] text-muted">{[v.phone, v.email].filter(Boolean).join(" · ")}</span>
                            <BookingAnswers answers={v.answers} compact className="w-full pl-15" />
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
              <details className="px-4 py-3">
                <summary className="cursor-pointer font-medium">{t("Plan an open house")}</summary>
                <div className="mt-3">
                  <OpenHouseForm
                    action={planOpenHouseAction.bind(null, listing.id)}
                    agents={agents.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
                    defaultAgentId={listing.agentId}
                  />
                </div>
              </details>
            </Panel>
          )}

          {tab === "viewings" && (
            <Panel className="divide-y divide-line">
              {listing.appointments.length === 0 && (
                <EmptyState icon={<CalendarDays className="size-5" />} title={t("No viewings yet")} description={t("Viewings booked on your website, by the planner or by phone appear here.")} />
              )}
              {listing.appointments.map((apt) => (
                <div key={apt.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-[150px] shrink-0 tabular-nums">{t.dateTime(apt.startsAt)}</div>
                  <div className="min-w-0 flex-1 truncate font-medium">
                    {fullName(apt.contact?.firstName, apt.contact?.lastName)}
                    {apt.openHouseId && <span className="ml-1.5 text-[12px] font-normal text-muted">{t("open house")}</span>}
                  </div>
                  <span className="flex items-center gap-1.5 text-[12px] text-muted">
                    <StatusDot color={appointmentStatusMeta[apt.status].color} />
                    {t(appointmentStatusMeta[apt.status].label)}
                  </span>
                  <Avatar name={apt.agent.name} color={apt.agent.color} />
                </div>
              ))}
            </Panel>
          )}

          {occupancy && (
            <div className="flex flex-col gap-4">
              <Panel className="p-4">
                <form action={setListingAccessAction.bind(null, listing.id)} className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-medium text-muted">{t("Who opens the door for viewings")}</span>
                    <select name="access" defaultValue={occupancy.access} className="h-8 rounded-md border border-line bg-panel px-2">
                      {Object.entries(accessLabel).map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-medium text-muted">{t("Notice the occupants need")}</span>
                    <select name="notice" defaultValue={occupancy.viewingNoticeHours ?? 0} className="h-8 rounded-md border border-line bg-panel px-2">
                      {[0, 12, 24, 48, 72].map((h) => (
                        <option key={h} value={h}>
                          {h === 0 ? t("Usual (2 hours)") : h < 24 ? t("{n} hours", { n: h }) : h === 24 ? t("1 day") : t("{n} days", { n: h / 24 })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button size="md">{t("Save")}</Button>
                </form>
                <p className="mt-3 text-muted">
                  {occupancy.access === "agent"
                    ? t("Viewings follow the agent's agenda only. Owners you add below still get an alert for each viewing.")
                    : t("Only the times the occupants give through their link can be booked, inside the agent's agenda. Viewings of this home are planned back to back.")}
                </p>
                {occupancy.access !== "agent" && listing.status === "active" && (occupancy.awaitingOccupant || occupancy.slotsNext14Days === 0) && (
                  <p className="mt-2 flex items-center gap-2">
                    <StatusDot color="var(--warning)" />
                    {occupancy.awaitingOccupant
                      ? t("No visiting times yet: visitors can only request a viewing.")
                      : t("No common time with the agent in the next 14 days.")}
                  </p>
                )}
                {occupancy.access !== "agent" && occupancy.windows.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {occupancy.windows.map((w, i) => (
                      <Pill key={i}>
                        {t(weekdayNames[w.weekday]!)} {hhmm(w.startMinute)}–{hhmm(w.endMinute)}
                      </Pill>
                    ))}
                    {occupancy.slotsNext14Days !== null && <span className="self-center text-[12px] text-muted">{t("{n} bookable times in the next 14 days", { n: occupancy.slotsNext14Days })}</span>}
                  </div>
                )}
                {occupancy.blocks.length > 0 && (
                  <p className="mt-2 text-muted">
                    {t("Away:")} {occupancy.blocks.map((b) => `${t.day(b.startsAt)} – ${t.day(new Date(b.endsAt.getTime() - 1))}`).join(", ")}
                  </p>
                )}
              </Panel>

              <Panel className="divide-y divide-line">
                {occupancy.occupants.length === 0 && (
                  <EmptyState icon={<KeyRound className="size-5" />} title={t("No owner or tenant yet")} description={t("Add them to give them a private link for their visiting times and an alert for each viewing.")} />
                )}
                {occupancy.occupants.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{fullName(o.contact.firstName, o.contact.lastName)}</span>
                        <Pill>{o.role === "tenant" ? t("Tenant") : t("Owner")}</Pill>
                      </div>
                      <div className="truncate text-[12px] text-muted">
                        {[o.contact.email, o.contact.phone].filter(Boolean).join(" · ")} · {o.lastSeenAt ? t("opened {when}", { when: t.relative(o.lastSeenAt) }) : t("hasn't opened the link yet")}
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 text-[12px] text-muted">
                      <StatusDot color={o.alerts ? "var(--success)" : "var(--faint)"} />
                      {o.alerts ? t("Alerts on") : t("Alerts off")}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <CopyLinkButton path={o.link} label={t("Copy link")} />
                      <form action={updateOccupantAction.bind(null, listing.id, o.id, { alerts: !o.alerts })}>
                        <Button size="sm">{o.alerts ? t("Turn alerts off") : t("Turn alerts on")}</Button>
                      </form>
                      <form action={updateOccupantAction.bind(null, listing.id, o.id, { newLink: true })}>
                        <Button size="sm">{t("New link")}</Button>
                      </form>
                      <form action={updateOccupantAction.bind(null, listing.id, o.id, { remove: true })}>
                        <Button size="sm" variant="ghost">
                          {t("Remove")}
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </Panel>

              <Panel className="p-4">
                <h2 className="mb-3 font-medium">{t("Add owner or tenant")}</h2>
                <OccupantForm defaultRole={occupancy.access === "tenant" ? "tenant" : "owner"} action={addOccupantAction.bind(null, listing.id)} />
              </Panel>
            </div>
          )}

          {tab === "leads" && matches.length > 0 && listing.status === "active" && (
            <Panel className="mb-4 border-ai-line p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Sparkles className="size-4 text-ai" />
                <span className="flex-1">
                  <span className="font-medium">
                    {matches.length === 1 ? t("1 client looked at similar properties") : t("{n} clients looked at similar properties", { n: matches.length })}
                  </span>
                  <span className="text-muted"> · {matches.slice(0, 4).map((m) => fullName(m.contact.firstName, m.contact.lastName)).join(", ")}</span>
                </span>
                <form action={suggestToMatchesAction.bind(null, listing.id)}>
                  <Button size="sm" variant="ai">
                    {t("Draft a suggestion for each")}
                  </Button>
                </form>
              </div>
            </Panel>
          )}
          {tab === "leads" && (
            <Panel className="divide-y divide-line">
              {listing.leads.length === 0 && <EmptyState icon={<MessageSquare className="size-5" />} title={t("No leads yet")} description={t("Portal and website requests for this listing appear here.")} />}
              {listing.leads.map((lead) => (
                <div key={lead.id} className="flex items-start gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fullName(lead.contact.firstName, lead.contact.lastName)}</span>
                      <Pill>{sourceLabel[lead.source] ? t(sourceLabel[lead.source]!) : lead.source}</Pill>
                    </div>
                    {lead.message && <p className="mt-0.5 line-clamp-2 text-muted">{lead.message}</p>}
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
                    <StatusDot color={leadStageMeta[lead.stage].color} />
                    {t(leadStageMeta[lead.stage].label)}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[12px] text-faint">{t.relative(lead.createdAt)}</span>
                </div>
              ))}
            </Panel>
          )}

          {tab === "details" && (
            <Panel className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2">
              {[
                [t("Reference"), listing.reference],
                [t("Type"), propertyTypeLabel[listing.propertyType] ? t(propertyTypeLabel[listing.propertyType]!) : listing.propertyType],
                [t("Transaction"), listing.transaction === "rent" ? t("Rent") : t("Sale")],
                [t("Price"), t.price(listing.price, listing.transaction)],
                [t("Bedrooms"), listing.bedrooms],
                [t("Bathrooms"), listing.bathrooms],
                [t("Living area"), listing.livingArea && `${listing.livingArea} m²`],
                [t("Plot area"), listing.plotArea && `${listing.plotArea} m²`],
                ["EPC", listing.epcLabel && `${listing.epcLabel} · ${listing.epcScore} kWh/m²`],
                [t("Immoweb ID"), listing.portalRefs.immoweb],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-4 border-b border-line pb-2.5">
                  <span className="text-muted">{label}</span>
                  <span className="text-right">{value ?? "—"}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1 sm:col-span-2">
                <AiPill>{t("Coming soon")}</AiPill>
                <span className="text-muted">{t("Characteristics filled in automatically from photos, plans and the EPC certificate.")}</span>
              </div>
            </Panel>
          )}

          {tab === "advertising" && (
            <EmptyState
              icon={<Megaphone className="size-5" />}
              title={t("Publish everywhere from one place")}
              description={t("Post this listing to your website, Immoweb, Zimmo and social media, with an AI-written description in NL, FR and EN.")}
              action={<AiPill>{t("On the roadmap")}</AiPill>}
            />
          )}
          {tab === "staging" && (
            <EmptyState
              icon={<ImagePlus className="size-5" />}
              title={t("Virtual staging")}
              description={t("Turn empty rooms into furnished ones in a few clicks, clearly labelled as virtually staged.")}
              action={<AiPill>{t("On the roadmap")}</AiPill>}
            />
          )}
          {tab === "notes" && (
            <EmptyState
              icon={<NotebookPen className="size-5" />}
              title={t("AI notetaker")}
              description={t("Record the intake visit with the owner. Notes, characteristics and to-dos are filled in for you.")}
              action={<Button variant="ai" size="sm" disabled><Sparkles className="size-3.5" />{t("On the roadmap")}</Button>}
            />
          )}
        </div>
      </div>
    </>
  );
}
