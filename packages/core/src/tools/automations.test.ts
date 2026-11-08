import { and, db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAutomations } from "../automations/jobs";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// Runs against a real Postgres (DATABASE_URL); skipped when none is configured.
describe.skipIf(!process.env.DATABASE_URL)("automations", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "system", id: null } };
  let agentId: string;
  let listingId: string;

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Test agency", slug: agencyId, createdAt: new Date() });
    await runTool(tools.seedDemoData, ctx, {});
    const [listing] = await db.select().from(schema.listings).where(and(eq(schema.listings.agencyId, agencyId), eq(schema.listings.status, "active")));
    listingId = listing!.id;
    agentId = listing!.agentId!;
    // The draft paths first; the last test switches back to the default (automatic).
    await runTool(tools.updateAutomationSettings, ctx, {
      sendRemindersAutomatically: false,
      sendFollowUpsAutomatically: false,
      sendNoShowsAutomatically: false,
      sendNudgesAutomatically: false,
    });
  });

  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });

  async function client(n: number) {
    const [contact] = await db
      .insert(schema.contacts)
      .values({ agencyId, firstName: `Auto${n}`, email: `auto${n}@example.com`, language: "fr" })
      .returning();
    const [lead] = await db.insert(schema.leads).values({ agencyId, contactId: contact!.id, listingId, agentId, source: "website", stage: "booked" }).returning();
    return { contactId: contact!.id, leadId: lead!.id };
  }

  async function viewing(n: number, startsAt: Date, createdAt = new Date(Date.now() - 3 * DAY)) {
    const { contactId, leadId } = await client(n);
    const [apt] = await db
      .insert(schema.appointments)
      .values({ agencyId, agentId, listingId, contactId, leadId, startsAt, endsAt: new Date(startsAt.getTime() + HOUR / 2), createdAt })
      .returning();
    return apt!;
  }

  const pendingFor = (subjectId: string) =>
    db.select().from(schema.proposals).where(and(eq(schema.proposals.agencyId, agencyId), eq(schema.proposals.subjectId, subjectId), eq(schema.proposals.status, "pending")));

  it("drafts a reminder once, withdraws it when the viewing moves, and sends it when the agency allows", async () => {
    const apt = await viewing(1, new Date(Date.now() + 20 * HOUR));
    await runAutomations(ctx, new Date(), { useAi: false });
    const [draft] = await pendingFor(apt.id);
    expect(draft?.kind).toBe("reminder");
    expect(String(draft!.input.body)).toContain("Un petit rappel");
    expect(String(draft!.input.body)).toContain(`/a/${apt.manageToken}`);

    await runAutomations(ctx, new Date(), { useAi: false });
    expect(await pendingFor(apt.id)).toHaveLength(1);

    await runTool(tools.updateAutomationSettings, ctx, { sendRemindersAutomatically: true });
    await db.update(schema.appointments).set({ startsAt: new Date(apt.startsAt.getTime() + HOUR) }).where(eq(schema.appointments.id, apt.id));
    const summary = await runAutomations(ctx, new Date(), { useAi: false });
    expect(summary.withdrawn).toBe(1);
    expect(await pendingFor(apt.id)).toHaveLength(0);
    const sent = await db.select().from(schema.messages).where(and(eq(schema.messages.agencyId, agencyId), eq(schema.messages.direction, "outbound")));
    const reminder = sent.find((m) => (m.metadata as { appointmentId?: string }).appointmentId === apt.id);
    expect(reminder?.delivery).toBe("simulated");
    expect((reminder?.metadata as { kind?: string }).kind).toBe("reminder");
    await runTool(tools.updateAutomationSettings, ctx, { sendRemindersAutomatically: false });
  });

  it("completes a past viewing and drafts the follow-up the next day", async () => {
    const apt = await viewing(2, new Date(Date.now() - 2 * DAY));
    const summary = await runAutomations(ctx, new Date(), { useAi: false });
    expect(summary.completed).toBeGreaterThanOrEqual(1);
    const [after] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, apt.id));
    expect(after!.status).toBe("completed");
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, apt.leadId!));
    expect(lead!.stage).toBe("visited");
    const [run] = await db.select().from(schema.automationRuns).where(and(eq(schema.automationRuns.subjectId, apt.id), eq(schema.automationRuns.rule, "follow_up")));
    expect(run?.outcome).toBe("drafted");
    const [proposal] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, run!.proposalId!));
    expect(proposal!.kind).toBe("follow_up");
  });

  it("marks a no-show, withdraws the follow-up and drafts new times", async () => {
    const apt = await viewing(3, new Date(Date.now() - 3 * HOUR));
    await runAutomations(ctx, new Date(), { useAi: false });
    const result = await runTool(tools.markAttendance, ctx, { appointmentId: apt.id, attended: false, useAi: false });
    expect(result.status).toBe("no_show");
    const [proposal] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, result.proposalId!));
    expect(proposal!.kind).toBe("no_show");
    expect((proposal!.input.offeredSlots as string[]).length).toBeGreaterThan(0);
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, apt.leadId!));
    expect(lead!.stage).toBe("invited");

    // The next day's run doesn't follow up on a viewing that didn't happen.
    const tomorrow = new Date(Date.now() + DAY);
    await runAutomations(ctx, tomorrow, { useAi: false });
    const runs = await db.select().from(schema.automationRuns).where(and(eq(schema.automationRuns.subjectId, apt.id), eq(schema.automationRuns.rule, "follow_up")));
    expect(runs).toHaveLength(0);
  });

  it("nudges a lead who didn't answer, at most twice", async () => {
    const { contactId, leadId } = await client(4);
    await db.update(schema.leads).set({ stage: "invited" }).where(eq(schema.leads.id, leadId));
    const sentAt = new Date(Date.now() - 4 * DAY);
    const [conversation] = await db
      .insert(schema.conversations)
      .values({ agencyId, contactId, leadId, listingId, agentId, channel: "email", provider: "outlook", status: "waiting", lastMessageAt: sentAt })
      .returning();
    await db.insert(schema.messages).values({ agencyId, conversationId: conversation!.id, direction: "outbound", delivery: "simulated", authorType: "user", body: "Bonjour", sentAt });

    const summary = await runAutomations(ctx, new Date(), { useAi: false });
    expect(summary.nudges).toBeGreaterThanOrEqual(1);
    const [draft] = await pendingFor(conversation!.id);
    expect(draft?.kind).toBe("nudge");
    expect((draft!.input.offeredSlots as string[]).length).toBeGreaterThan(0);

    // A pending nudge is not drafted again.
    await runAutomations(ctx, new Date(), { useAi: false });
    expect(await pendingFor(conversation!.id)).toHaveLength(1);
  });

  it("sends everything on its own by default: reminders, follow-ups, no-show messages and nudges, in fixed text", async () => {
    const fresh: ToolContext = { db, agencyId: newId("org"), actor: { type: "system", id: null } };
    expect(await runTool(tools.getAutomationSettings, fresh, {})).toMatchObject({
      sendRemindersAutomatically: true,
      sendFollowUpsAutomatically: true,
      sendNoShowsAutomatically: true,
      sendNudgesAutomatically: true,
      replyToPortalLeadsAutomatically: true,
      sendBookingConfirmationsAutomatically: true,
    });

    await runTool(tools.updateAutomationSettings, ctx, {
      sendRemindersAutomatically: true,
      sendFollowUpsAutomatically: true,
      sendNoShowsAutomatically: true,
      sendNudgesAutomatically: true,
    });
    const outbound = async (kind: string, contactId: string) =>
      (
        await db
          .select({ m: schema.messages, c: schema.conversations })
          .from(schema.messages)
          .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
          .where(and(eq(schema.messages.agencyId, agencyId), eq(schema.messages.direction, "outbound"), eq(schema.conversations.contactId, contactId)))
      ).filter((r) => (r.m.metadata as { kind?: string }).kind === kind);

    const done = await viewing(5, new Date(Date.now() - 2 * DAY));
    await runAutomations(ctx, new Date(), { useAi: false });
    const [run] = await db.select().from(schema.automationRuns).where(and(eq(schema.automationRuns.subjectId, done.id), eq(schema.automationRuns.rule, "follow_up")));
    expect(run?.outcome).toBe("sent");
    const [followUp] = await outbound("follow_up", done.contactId!);
    expect(followUp?.m.delivery).toBe("simulated");
    expect(followUp?.m.authorType).toBe("agent");

    const missed = await viewing(6, new Date(Date.now() - 3 * HOUR));
    await runAutomations(ctx, new Date(), { useAi: false });
    await runTool(tools.markAttendance, ctx, { appointmentId: missed.id, attended: false, useAi: false });
    const [noShow] = await outbound("no_show", missed.contactId!);
    expect(noShow?.m.body).toContain(`/book/${listingId}`);
    expect(await pendingFor(missed.id)).toHaveLength(0);

    const { contactId, leadId } = await client(7);
    await db.update(schema.leads).set({ stage: "invited" }).where(eq(schema.leads.id, leadId));
    const sentAt = new Date(Date.now() - 4 * DAY);
    const [conversation] = await db
      .insert(schema.conversations)
      .values({ agencyId, contactId, leadId, listingId, agentId, channel: "email", provider: "outlook", status: "waiting", lastMessageAt: sentAt })
      .returning();
    await db.insert(schema.messages).values({ agencyId, conversationId: conversation!.id, direction: "outbound", delivery: "simulated", authorType: "user", body: "Bonjour", sentAt });
    await runAutomations(ctx, new Date(), { useAi: false });
    expect(await outbound("nudge", contactId)).toHaveLength(1);
    expect(await pendingFor(conversation!.id)).toHaveLength(0);
  });
});
