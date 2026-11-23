import { db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultBookingQuestions } from "../planner/qualification";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";
import { calendarEvent } from "./booking";
import { agentAlertText } from "../planner/agent-alerts";

const own = [
  { id: "parking", kind: "choice" as const, question: { nl: "Heeft u een parkeerplaats nodig?", fr: "Avez-vous besoin d'un parking ?" }, options: [{ id: "y", label: { nl: "Ja", fr: "Oui" } }, { id: "n", label: { nl: "Nee", fr: "Non" } }] },
  { id: "budget", kind: "text" as const, question: { nl: "Wat is uw budget?" } },
];

describe("calendarEvent", () => {
  it("puts contact details, the message and the answers in the event description", () => {
    const event = calendarEvent(null, { firstName: "An", lastName: "Peeters", email: "an@example.com", phone: "+32470000000" }, new Date(), new Date(), {
      message: "Graag ook de tuin zien",
      answers: [{ id: "parking", question: "Heeft u een parkeerplaats nodig?", answer: "Ja" }],
    });
    expect(event.description).toBe("an@example.com\n+32470000000\n\nGraag ook de tuin zien\n\nHeeft u een parkeerplaats nodig?\n→ Ja");
  });
});

describe("agentAlertText", () => {
  it("lists the client's answers in the agent's email", () => {
    const { text } = agentAlertText({
      action: { kind: "booked" },
      type: "viewing",
      lang: "nl",
      client: { name: "An Peeters", email: "an@example.com", phone: null },
      startsAt: new Date("2027-03-02T09:00:00Z"),
      place: "Kerkstraat 1, Gent",
      source: "website",
      note: null,
      answers: [{ question: "Heeft u een parkeerplaats nodig?", answer: "Ja" }],
      link: "https://app/appointments",
    });
    expect(text).toContain("Antwoorden van de klant:\n- Heeft u een parkeerplaats nodig? → Ja\n\nBekijk in de planning: https://app/appointments");
  });
});

// Runs against a real Postgres (DATABASE_URL); skipped when none is configured.
describe.skipIf(!process.env.DATABASE_URL)("booking questions", () => {
  const agencyId = newId("org");
  const otherId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "system", id: null } };
  const otherCtx: ToolContext = { db, agencyId: otherId, actor: { type: "system", id: null } };

  beforeAll(async () => {
    for (const id of [agencyId, otherId]) await db.insert(schema.organization).values({ id, name: "Test agency", slug: id, createdAt: new Date() });
    await runTool(tools.seedDemoData, ctx, {});
  });

  afterAll(async () => {
    for (const id of [agencyId, otherId]) await db.delete(schema.organization).where(eq(schema.organization.id, id));
  });

  it("starts with our default questions for sale and rent", async () => {
    const got = await runTool(tools.getBookingQuestions, ctx, {});
    expect(got.sale).toEqual({ questions: defaultBookingQuestions.sale, custom: false });
    expect(got.rent.custom).toBe(false);
  });

  it("saves the agency's own questions per kind of listing, for this agency only", async () => {
    await runTool(tools.updateBookingQuestions, ctx, { transaction: "sale", questions: own });
    const got = await runTool(tools.getBookingQuestions, ctx, {});
    expect(got.sale).toEqual({ questions: own, custom: true });
    expect(got.rent.custom).toBe(false);
    expect((await runTool(tools.getBookingQuestions, otherCtx, {})).sale.custom).toBe(false);

    const fr = await runTool(tools.bookingQuestionsForWidget, ctx, { transaction: "sale", lang: "fr" });
    expect(fr.map((q) => q.question)).toEqual(["Avez-vous besoin d'un parking ?", "Wat is uw budget?"]);
  });

  it("refuses questions without text or with a single choice", async () => {
    await expect(runTool(tools.updateBookingQuestions, ctx, { transaction: "rent", questions: [{ id: "a", kind: "text", question: { nl: " " } }] })).rejects.toThrow();
    await expect(
      runTool(tools.updateBookingQuestions, ctx, { transaction: "rent", questions: [{ id: "a", kind: "choice", question: { nl: "Vraag" }, options: [{ id: "x", label: { nl: "Ja" } }] }] }),
    ).rejects.toThrow();
  });

  it("stores the answers with the booking in the agency's words", async () => {
    const listing = (await runTool(tools.listListings, ctx, { status: "active" })).find((l) => l.transaction === "sale")!;
    const clientCtx: ToolContext = { ...ctx, actor: { type: "contact", id: null } };
    const { slots } = await runTool(tools.availableSlots, clientCtx, { listingId: listing.id });
    const booked = await runTool(tools.bookViewing, clientCtx, {
      listingId: listing.id,
      startsAt: slots[2]!.start,
      contact: { firstName: "Questions", email: "questions@example.com", language: "fr", whatsappOptIn: false },
      qualification: { parking: "y", budget: " 450.000 euro ", purpose: "own" },
      message: "with answers",
    });
    const apt = await db.query.appointments.findFirst({ where: (a, { eq }) => eq(a.id, booked.appointmentId), with: { lead: true } });
    expect(apt!.lead!.qualification).toEqual({
      answers: [
        { id: "parking", question: "Heeft u een parkeerplaats nodig?", answer: "Ja" },
        { id: "budget", question: "Wat is uw budget?", answer: "450.000 euro" },
      ],
    });
  });

  it("shows the answers on the planned viewing: calendar, viewing list and the request", async () => {
    const apt = await db.query.appointments.findFirst({ where: (a, { eq }) => eq(a.notes, "with answers"), with: { contact: true } });
    expect(apt).toBeTruthy();
    const listed = await runTool(tools.listAppointments, ctx, { from: new Date(apt!.startsAt.getTime() - 60_000), to: new Date(apt!.endsAt.getTime() + 60_000) });
    const row = listed.find((a) => a.id === apt!.id)!;
    expect(row.leadId).toBe(apt!.leadId);
    expect(row.answers.map((a) => a.answer)).toEqual(["Ja", "450.000 euro"]);
    const request = await runTool(tools.getRequest, ctx, { id: apt!.leadId! });
    expect(request!.answers.map((a) => a.id)).toEqual(["parking", "budget"]);
    // Another agency's list never carries them.
    const other = await runTool(tools.listAppointments, otherCtx, { from: new Date(apt!.startsAt.getTime() - 60_000), to: new Date(apt!.endsAt.getTime() + 60_000) });
    expect(other.some((a) => a.id === apt!.id)).toBe(false);
  });

  it("goes back to the default questions", async () => {
    await runTool(tools.updateBookingQuestions, ctx, { transaction: "sale", questions: null });
    expect((await runTool(tools.getBookingQuestions, ctx, {})).sale).toEqual({ questions: defaultBookingQuestions.sale, custom: false });
  });
});
