import { db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";
import { SlotUnavailableError } from "./booking";

// Runs against a real Postgres (DATABASE_URL); skipped when none is configured.
describe.skipIf(!process.env.DATABASE_URL)("booking", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "system", id: null } };
  let listingId: string;

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Test agency", slug: agencyId, createdAt: new Date() });
    await runTool(tools.seedDemoData, ctx, {});
    const listings = await runTool(tools.listListings, ctx, { status: "active" });
    listingId = listings[0]!.id;
  });

  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });

  const contact = (n: number) => ({ firstName: `Test${n}`, email: `test${n}@example.com`, whatsappOptIn: false });

  it("books a free slot once and refuses the same slot again", async () => {
    const { slots } = await runTool(tools.availableSlots, ctx, { listingId });
    const slot = slots[3]!;
    const booked = await runTool(tools.bookViewing, ctx, { listingId, startsAt: slot.start, contact: contact(1) });
    expect(booked.startsAt.getTime()).toBe(slot.start.getTime());

    await expect(runTool(tools.bookViewing, ctx, { listingId, startsAt: slot.start, contact: contact(2) })).rejects.toBeInstanceOf(SlotUnavailableError);
    const after = await runTool(tools.availableSlots, ctx, { listingId });
    expect(after.slots.some((s) => s.start.getTime() === slot.start.getTime())).toBe(false);
  });

  it("lets only one of two simultaneous bookings win", async () => {
    const { slots } = await runTool(tools.availableSlots, ctx, { listingId });
    const slot = slots[slots.length - 1]!;
    const results = await Promise.allSettled([
      runTool(tools.bookViewing, ctx, { listingId, startsAt: slot.start, contact: contact(3) }),
      runTool(tools.bookViewing, ctx, { listingId, startsAt: slot.start, contact: contact(4) }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("reschedules and cancels, freeing the time again", async () => {
    const { slots } = await runTool(tools.availableSlots, ctx, { listingId });
    const booked = await runTool(tools.bookViewing, ctx, { listingId, startsAt: slots[6]!.start, contact: contact(5) });
    const moved = await runTool(tools.rescheduleAppointment, ctx, { appointmentId: booked.appointmentId, startsAt: slots[9]!.start });
    expect(moved.startsAt.getTime()).toBe(slots[9]!.start.getTime());

    const mid = await runTool(tools.availableSlots, ctx, { listingId });
    expect(mid.slots.some((s) => s.start.getTime() === slots[6]!.start.getTime())).toBe(true);

    await runTool(tools.cancelAppointment, ctx, { appointmentId: booked.appointmentId, reopenLead: true });
    const end = await runTool(tools.availableSlots, ctx, { listingId });
    expect(end.slots.some((s) => s.start.getTime() === slots[9]!.start.getTime())).toBe(true);
  });

  it("puts a cancellation through the client's link in the inbox with new times", async () => {
    const { slots } = await runTool(tools.availableSlots, ctx, { listingId });
    const booked = await runTool(tools.bookViewing, ctx, { listingId, startsAt: slots[12]!.start, contact: contact(6) });
    const clientCtx: ToolContext = { ...ctx, actor: { type: "contact", id: null } };
    await runTool(tools.cancelAppointment, clientCtx, { appointmentId: booked.appointmentId, reopenLead: true });

    const { items } = await runTool(tools.listInbox, ctx, { folder: "changes" });
    const conversation = items.find((c) => c.contact?.email === "test6@example.com");
    expect(conversation?.category).toBe("cancellation");
    expect(conversation?.pendingDraft).not.toBeNull();
    const full = await runTool(tools.getConversation, ctx, { conversationId: conversation!.id });
    expect(full?.draft?.input.offeredSlots).toHaveLength(3);
    expect(full?.draft?.input.cancelAppointmentId).toBeUndefined();
  });

  it("executes an approved proposal", async () => {
    const [proposal] = await runTool(tools.listProposals, ctx, {});
    const decided = await runTool(tools.decideProposal, { ...ctx, actor: { type: "user", id: null } }, { proposalId: proposal!.id, decision: "approved" });
    expect(decided.status).toBe("executed");
  });
});
