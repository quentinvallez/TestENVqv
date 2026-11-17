import { and, db, eq, newId, schema } from "@viewing/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";

describe.skipIf(!process.env.DATABASE_URL)("dashboard", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Vastgoed Dashboard", slug: agencyId, createdAt: new Date() });
    await runTool(tools.seedDemoData, ctx, {});
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("counts every planned viewing, leaves cancelled ones out and saves 30 minutes each", async () => {
    const all = await db.select().from(schema.appointments).where(eq(schema.appointments.agencyId, agencyId));
    const planned = all.filter((a) => a.type === "viewing" && a.status !== "cancelled").length;
    const result = await runTool(tools.dashboardSummary, ctx, {});
    expect(planned).toBeGreaterThan(0);
    expect(result.viewingsPlanned).toBe(planned);
    expect(result.minutesSaved).toBe(planned * 30);
    expect(result.upcomingViewings).toBeLessThanOrEqual(planned);
  });

  it("lists agents without a login, mailbox or calendar", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("CALENDAR_TOKEN_KEY", "a".repeat(64));
    const team = await db.select().from(schema.agents).where(and(eq(schema.agents.agencyId, agencyId), eq(schema.agents.active, true)));
    await db.insert(schema.calendarConnections).values([
      { agencyId, agentId: team[0]!.id, provider: "google", accountEmail: "a@example.be", scopes: ["calendar", "mail"], status: "active", credentials: "x" },
      { agencyId, agentId: team[1]!.id, provider: "microsoft", accountEmail: "b@example.be", scopes: ["calendar", "mail"], status: "expired", credentials: "x" },
    ]);
    const result = await runTool(tools.listTeamNotConnected, ctx, {});
    expect(result.total).toBe(team.length);
    // Demo agents have no logins, so everyone is listed; only what's missing differs.
    expect(result.agents.find((a) => a.agentId === team[0]!.id)?.missing).toEqual(["login"]);
    expect(result.agents.find((a) => a.agentId === team[1]!.id)?.missing).toEqual(["login", "mailbox", "calendar"]);

    vi.unstubAllEnvs();
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "");
    const withoutOauth = await runTool(tools.listTeamNotConnected, ctx, {});
    // Without Google/Microsoft set up, nobody can connect a mailbox, so only logins count.
    expect(withoutOauth.agents.every((a) => a.missing.join() === "login")).toBe(true);
  });
});
