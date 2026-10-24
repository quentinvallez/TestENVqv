import { db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";

describe.skipIf(!process.env.DATABASE_URL)("recommendations", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  const contactId = async (firstName: string) => (await runTool(tools.listContacts, ctx, { search: firstName }))[0]!.id;
  const listingId = async (reference: string) => (await runTool(tools.listListings, ctx, { search: reference }))[0]!.id;

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Test agency", slug: agencyId, createdAt: new Date() });
    await runTool(tools.seedDemoData, ctx, {});
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });

  it("suggests a similar house to someone who looked at a house, never sold ones or ones they saw", async () => {
    const recs = await runTool(tools.recommendForContact, ctx, { contactId: await contactId("Lucas") });
    expect(recs.map((r) => r.listing.reference)).toContain("GNT-2020");
    expect(recs.every((r) => r.listing.status === "active" && r.listing.reference !== "ANT-1043")).toBe(true);
  });

  it("drafts the suggestion in the inbox with booking links", async () => {
    const result = await runTool(tools.suggestListings, ctx, { contactId: await contactId("Lucas"), useAi: false });
    expect(result.suggested).toBeGreaterThan(0);
    const full = await runTool(tools.getConversation, ctx, { conversationId: result.conversationId! });
    expect(full!.draft!.kind).toBe("recommendation");
    expect(String(full!.draft!.input.body)).toMatch(/\/book\/lst_/);
  });

  it("finds clients for a listing among people interested in similar ones", async () => {
    const matches = await runTool(tools.findMatchingClients, ctx, { listingId: await listingId("GNT-2020") });
    const names = matches.map((m) => m.contact.firstName);
    expect(names).toEqual(expect.arrayContaining(["Lucas", "Louis"]));
    expect(names).not.toContain("Jules"); // already interested in this one
  });
});
