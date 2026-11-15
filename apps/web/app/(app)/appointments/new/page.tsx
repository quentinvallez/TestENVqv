import { runTool, tools } from "@viewing/core";
import { PageHeader, Panel } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { address, formatDay, formatTime, fullName } from "@/lib/format";
import { bookForClientAction } from "../../actions";
import { BookForm, ChoiceSelect } from "./book-form";

const field = "h-8 w-full rounded-md border border-line bg-panel px-2 outline-none focus:border-line-strong";

/** Book a viewing for a client, e.g. someone on the phone: pick the listing, a free time (or the time you agreed), and who it is for. */
export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<{ listingId?: string; agentId?: string; contactId?: string }> }) {
  const params = await searchParams;
  const ctx = await getToolContext();
  const [listings, agents] = await Promise.all([runTool(tools.listListings, ctx, { status: "active" }), runTool(tools.listAgents, ctx, {})]);
  const listing = listings.find((l) => l.id === params.listingId);
  const activeAgents = agents.filter((a) => a.active);
  const agentId = activeAgents.some((a) => a.id === params.agentId) ? params.agentId : undefined;
  const contact = params.contactId ? ((await runTool(tools.getContact, ctx, { contactId: params.contactId }))?.contact ?? null) : null;
  const free = listing ? await runTool(tools.availableSlots, ctx, { listingId: listing.id, agentId, days: 14 }) : null;

  const days: { label: string; times: { value: string; label: string; openHouse: boolean; spotsLeft?: number }[] }[] = [];
  for (const slot of free?.slots ?? []) {
    const label = formatDay(slot.start);
    let day = days.find((d) => d.label === label);
    if (!day) days.push((day = { label, times: [] }));
    const openHouse = "openHouseId" in slot && Boolean(slot.openHouseId);
    day.times.push({ value: slot.start.toISOString(), label: formatTime(slot.start), openHouse, spotsLeft: openHouse ? (slot as { spotsLeft?: number }).spotsLeft : undefined });
  }

  return (
    <>
      <PageHeader crumbs={[{ label: "Appointments", href: "/appointments" }, { label: "Book a viewing" }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5 md:px-5">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">Book a viewing for a client</h1>
            <p className="mt-0.5 text-muted">For someone who calls or walks in. The viewing goes in the agent's agenda, and the client can get the usual confirmation with the link to move or cancel it.</p>
          </div>

          <Panel className="p-4">
            <form method="get" className="grid gap-3 sm:grid-cols-2">
              {contact && <input type="hidden" name="contactId" value={contact.id} />}
              <label className="flex flex-col gap-1">
                <span className="text-[12px] text-muted">Listing</span>
                <ChoiceSelect name="listingId" defaultValue={listing?.id ?? ""} className={field}>
                  <option value="" disabled>
                    Choose a listing…
                  </option>
                  {listings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.reference} · {address(l.street, l.houseNumber, l.city) || l.title}
                    </option>
                  ))}
                </ChoiceSelect>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] text-muted">Agent</span>
                <ChoiceSelect name="agentId" defaultValue={agentId ?? ""} className={field}>
                  <option value="">{listing?.agentName ? `${listing.agentName} (responsible)` : "The listing's agent"}</option>
                  {activeAgents
                    .filter((a) => a.id !== listing?.agentId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </ChoiceSelect>
              </label>
              <noscript>
                <button className="h-8 rounded-md border border-line px-3">Show free times</button>
              </noscript>
            </form>
          </Panel>

          {listing && free && (
            <BookForm
              action={bookForClientAction}
              listingId={listing.id}
              agentId={agentId}
              agentName={free.agent.name}
              days={days}
              awaitingOccupant={free.awaitingOccupant}
              contact={
                contact
                  ? { id: contact.id, name: fullName(contact.firstName, contact.lastName), detail: [contact.phone, contact.email].filter(Boolean).join(" · "), canConfirm: Boolean(contact.email || (contact.whatsappOptIn && contact.phone)) }
                  : null
              }
            />
          )}
          {!listing && listings.length === 0 && <p className="text-muted">There are no listings on the market to book.</p>}
        </div>
      </div>
    </>
  );
}
