import { and, db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";

// Runs against a real Postgres (DATABASE_URL); skipped when none is configured.
describe.skipIf(!process.env.DATABASE_URL)("valuations", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "system", id: null } };
  const client: ToolContext = { ...ctx, actor: { type: "contact", id: null } };
  const answers = { propertyType: "house" as const, livingArea: 160, bedrooms: 3, bathrooms: 1, condition: "good" as const, epcLabel: "D" as const, extras: [], plans: "sell_soon" as const };
  const request = (postcode: string, phone: string) =>
    runTool(tools.requestValuation, client, { street: "Teststraat", houseNumber: "1", postcode, city: "Testdorp", firstName: "Ann", phone, consent: true, answers });

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Test agency", slug: agencyId, createdAt: new Date() });
    await runTool(tools.seedDemoData, ctx, {});
    // A made-up municipality, only for this test.
    await db.insert(schema.postcodes).values({ postcode: "9999", locality: "Testdorp", nisCode: "99999", municipality: "Testdorp", region: "flanders" }).onConflictDoNothing();
    await db
      .insert(schema.marketPrices)
      .values({ nisCode: "99999", municipality: "Testdorp", region: "flanders", propertyType: "house", year: 2025, transactions: 200, p25: 250000, median: 300000, p75: 360000 })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
    await db.delete(schema.marketPrices).where(eq(schema.marketPrices.nisCode, "99999"));
    await db.delete(schema.postcodes).where(eq(schema.postcodes.postcode, "9999"));
  });

  it("shows nothing before the phone is verified", async () => {
    const started = await request("2600", "0470 11 11 11");
    expect(started.method).toBe("demo");
    const wrong = await runTool(tools.verifyValuation, client, { token: started.token, code: "000000", useAi: false });
    expect(wrong.verified).toBe(false);
    const saved = await runTool(tools.getValuation, ctx, { token: started.token });
    expect(saved?.result).toBeNull();
  });

  it("estimates from the agency's nearby sales, creates a seller lead and a draft with visit times", async () => {
    const started = await request("2600", "0470 22 22 22");
    const done = await runTool(tools.verifyValuation, client, { token: started.token, code: started.demoCode!, useAi: false });
    expect(done.verified).toBe(true);
    expect(done.result?.method).toBe("comparables"); // no Statbel data for 2600 in the test database
    expect(done.result!.low).toBeLessThan(done.result!.high);

    const saved = await runTool(tools.getValuation, ctx, { token: started.token });
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, saved!.leadId!));
    expect(lead).toMatchObject({ intent: "sell", source: "valuation", stage: "new" });

    const { items } = await runTool(tools.listInbox, ctx, { folder: "sellers" });
    const conversation = items.find((c) => c.contact?.phone === "+32470222222")!;
    expect(conversation.priority).toBe("high");
    const full = await runTool(tools.getConversation, ctx, { conversationId: conversation.id });
    expect(String(full!.draft!.input.body)).toContain("Geschatte waarde");
    expect(full!.draft!.input.offeredSlots).toHaveLength(3);

    // The owner books a one-hour visit from the report.
    const { slots } = await runTool(tools.availableSlots, ctx, { agentId: saved!.agentId!, minutes: 60 });
    const visit = await runTool(tools.bookValuationVisit, client, { valuationToken: started.token, startsAt: slots[0]!.start });
    const [appointment] = await db.select().from(schema.appointments).where(and(eq(schema.appointments.id, visit.appointmentId)));
    expect(appointment!.type).toBe("valuation");
    expect(appointment!.endsAt.getTime() - appointment!.startsAt.getTime()).toBe(60 * 60 * 1000);
  });

  it("uses Statbel market data when the postcode has it", async () => {
    const started = await request("9999", "0470 33 33 33");
    const done = await runTool(tools.verifyValuation, client, { token: started.token, code: started.demoCode!, useAi: false });
    expect(done.result?.method).toBe("market");
    expect(done.result?.marketMedian?.municipality).toBe("Testdorp");
  });
});
