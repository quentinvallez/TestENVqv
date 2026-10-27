import { and, db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";

// Runs against a real Postgres (DATABASE_URL); skipped when none is configured.
describe.skipIf(!process.env.DATABASE_URL)("owners and tenants", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  const visitorCtx: ToolContext = { db, agencyId, actor: { type: "contact", id: null } };
  let listingId: string;
  let token: string;

  const hour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hourCycle: "h23" }).format(d));
  const weekdays10to12 = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 600, endMinute: 720 }));
  const visitor = (n: number) => ({ firstName: `Visitor${n}`, lastName: "Peeters", email: `visitor${n}@example.com`, whatsappOptIn: false });

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Test agency", slug: agencyId, createdAt: new Date() });
    await runTool(tools.seedDemoData, ctx, {});
    listingId = (await runTool(tools.listListings, ctx, { status: "active" }))[0]!.id;
  });

  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });

  it("offers no times for an occupied home until its owner gives some", async () => {
    await runTool(tools.setListingAccess, ctx, { listingId, access: "owner" });
    const added = await runTool(tools.addListingOccupant, ctx, { listingId, role: "owner", contact: { firstName: "Marie", lastName: "Claes", email: "marie@example.com", whatsappOptIn: false } });
    token = added.link.slice(3);
    expect(added.proposalId).toBeTruthy();
    const { slots, awaitingOccupant } = await runTool(tools.availableSlots, ctx, { listingId });
    expect(slots).toEqual([]);
    expect(awaitingOccupant).toBe(true);
  });

  it("offers only times inside the owner's windows", async () => {
    await runTool(tools.setOccupantAvailability, visitorCtx, { token, windows: weekdays10to12, away: [] });
    const { slots, awaitingOccupant } = await runTool(tools.availableSlots, ctx, { listingId });
    expect(awaitingOccupant).toBe(false);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(hour(s.start)).toBeGreaterThanOrEqual(10);
      expect(hour(s.end) * 60 + s.end.getUTCMinutes()).toBeLessThanOrEqual(12 * 60);
    }
  });

  it("puts viewings at the same house back to back and alerts the owner", async () => {
    const { slots } = await runTool(tools.availableSlots, ctx, { listingId });
    const first = slots.find((s) => hour(s.start) === 10 && s.start.getUTCMinutes() === 0)!;
    const booked = await runTool(tools.bookViewing, visitorCtx, { listingId, startsAt: first.start, contact: visitor(1) });
    const after = await runTool(tools.availableSlots, ctx, { listingId });
    // The agent's 15-minute buffer doesn't apply between two viewings of the same home.
    expect(after.slots.some((s) => s.start.getTime() === first.end.getTime())).toBe(true);

    const page = await runTool(tools.getOccupantPage, visitorCtx, { token });
    const viewing = page.viewings.find((v) => v.id === booked.appointmentId)!;
    expect(viewing.visitor).toBe("Visitor1 P.");

    const owner = await db.query.listingOccupants.findFirst({ where: eq(schema.listingOccupants.token, token) });
    const alerts = await db
      .select()
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
      .where(and(eq(schema.conversations.agencyId, agencyId), eq(schema.conversations.contactId, owner!.contactId), eq(schema.messages.direction, "outbound")));
    expect(alerts.some((a) => a.messages.metadata.kind === "occupant_booked" && a.messages.delivery === "simulated")).toBe(true);
    // Never the visitor's contact details.
    expect(alerts.every((a) => !a.messages.body.includes("visitor1@example.com"))).toBe(true);
  });

  it("keeps a viewing the owner can no longer receive, and drafts a request to move it", async () => {
    const page = await runTool(tools.getOccupantPage, visitorCtx, { token });
    const viewing = page.viewings[0]!;
    const result = await runTool(tools.setOccupantAvailability, visitorCtx, { token, windows: [{ weekday: 6, startMinute: 600, endMinute: 720 }], away: [] });
    // The demo data has other viewings of this home too; none of them fit Saturday mornings.
    expect(result.conflicts).toBe(page.viewings.length);
    const [apt] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, viewing.id));
    expect(apt!.status).toBe("confirmed");
    const [proposal] = await db.select().from(schema.proposals).where(and(eq(schema.proposals.agencyId, agencyId), eq(schema.proposals.kind, "occupant_conflict"), eq(schema.proposals.subjectId, viewing.id)));
    expect(proposal!.status).toBe("pending");
  });

  it("drafts an urgent request when the owner reports a problem", async () => {
    await runTool(tools.setOccupantAvailability, visitorCtx, { token, windows: weekdays10to12, away: [] });
    const { viewings } = await runTool(tools.getOccupantPage, visitorCtx, { token });
    const { drafted } = await runTool(tools.reportOccupantProblem, visitorCtx, { token, appointmentId: viewings[0]!.id, note: "Plumber coming" });
    expect(drafted).toBe(1);
  });

  it("blocks the days the owner is away", async () => {
    const { slots } = await runTool(tools.availableSlots, ctx, { listingId });
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(slots[0]!.start);
    await runTool(tools.setOccupantAvailability, visitorCtx, { token, windows: weekdays10to12, away: [{ from: day, to: day }] });
    const after = await runTool(tools.availableSlots, ctx, { listingId });
    expect(after.slots.some((s) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(s.start) === day)).toBe(false);
  });

  it("takes a viewing request when there is no time to book", async () => {
    const { leadId } = await runTool(tools.requestViewing, visitorCtx, { listingId, contact: visitor(9) });
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
    expect(lead!.stage).toBe("new");
  });

  it("rejects a link from another agency", async () => {
    const other: ToolContext = { db, agencyId: newId("org"), actor: { type: "contact", id: null } };
    await expect(runTool(tools.getOccupantPage, other, { token })).rejects.toThrow();
  });
});
