import { and, db, eq, newId, schema } from "@viewing/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { conversationFor, sendMessage } from "../channels";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";
import { externalBusy, syncAppointmentToCalendar } from "./index";

/** Outlook end to end against recorded-shape Microsoft responses: connect, busy times, events, sending mail. */
describe.skipIf(!process.env.DATABASE_URL)("Outlook", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  let agentId: string;
  const calls: { url: string; method: string; body: unknown; auth: string | null }[] = [];

  const idToken = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
  function graph(url: string, init: RequestInit = {}) {
    const body = typeof init.body === "string" ? (init.body.startsWith("{") ? JSON.parse(init.body) : init.body) : init.body ? String(init.body) : null;
    calls.push({ url, method: init.method ?? "GET", body, auth: new Headers(init.headers).get("authorization") });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (url.endsWith("/oauth2/v2.0/token")) {
      const params = new URLSearchParams(String(init.body));
      if (params.get("grant_type") === "refresh_token") return json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600, scope: "Calendars.ReadWrite Mail.Send" });
      return json({
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_in: 3600,
        scope: "Calendars.ReadWrite Mail.Send User.Read profile openid email",
        id_token: idToken({ preferred_username: "Quentin@Agency.be" }),
      });
    }
    if (url.includes("/me/calendarView")) {
      return json({
        value: [
          { start: { dateTime: "2026-11-02T09:00:00.0000000" }, end: { dateTime: "2026-11-02T10:00:00.0000000" }, showAs: "busy" },
          { start: { dateTime: "2026-11-02T12:00:00.0000000" }, end: { dateTime: "2026-11-02T13:00:00.0000000" }, showAs: "free" },
        ],
      });
    }
    if (url.endsWith("/me/events") && init.method === "POST") return json({ id: "AAMk-event-1" }, 201);
    if (url.includes("/me/events/")) return new Response(null, { status: init.method === "DELETE" ? 204 : 200 });
    if (url.endsWith("/me/sendMail")) return new Response(null, { status: 202 });
    return json({ error: "unexpected" }, 500);
  }

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Outlook test", slug: agencyId, createdAt: new Date() });
    const [agent] = await db.insert(schema.agents).values({ agencyId, name: "Quentin", email: "quentin@agency.be" }).returning();
    agentId = agent!.id;
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stub() {
    vi.stubEnv("MICROSOFT_CLIENT_ID", "client");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "secret");
    vi.stubEnv("CALENDAR_TOKEN_KEY", "k".repeat(40));
    vi.stubGlobal("fetch", vi.fn(graph));
  }

  it("connects with calendar and mail, storing the tokens encrypted", async () => {
    stub();
    const result = await runTool(tools.connectCalendar, ctx, { agentId, provider: "microsoft", code: "abc", redirectUri: "https://testenvqv.vercel.app/api/calendar/microsoft/callback" });
    expect(result).toMatchObject({ accountEmail: "quentin@agency.be", scopes: ["calendar", "mail"] });
    const [row] = await db.select().from(schema.calendarConnections).where(eq(schema.calendarConnections.agentId, agentId));
    expect(row!.credentials).not.toContain("access-1");
    const token = new URLSearchParams(String(calls[0]!.body));
    expect(token.get("redirect_uri")).toBe("https://testenvqv.vercel.app/api/calendar/microsoft/callback");
    expect(token.get("client_secret")).toBe("secret");
  });

  it("reads busy times in UTC, ignoring free events", async () => {
    stub();
    const busy = await externalBusy(ctx, agentId, new Date("2026-11-02T00:00:00Z"), new Date("2026-11-03T00:00:00Z"));
    expect(busy).toEqual([{ start: new Date("2026-11-02T09:00:00Z"), end: new Date("2026-11-02T10:00:00Z") }]);
    expect(calls.at(-1)!.auth).toBe("Bearer access-1");
  });

  it("creates, moves and deletes the viewing without inviting the client", async () => {
    stub();
    const event = { title: "Viewing", start: new Date("2026-11-03T14:00:00Z"), end: new Date("2026-11-03T14:30:00Z"), location: "Kerkstraat 1", attendeeEmail: "client@example.be" };
    const id = await syncAppointmentToCalendar(ctx, agentId, null, event);
    expect(id).toBe("AAMk-event-1");
    const created = calls.at(-1)!;
    expect(created.body).toMatchObject({ start: { dateTime: "2026-11-03T14:00:00", timeZone: "UTC" }, location: { displayName: "Kerkstraat 1" } });
    expect(JSON.stringify(created.body)).not.toContain("client@example.be");
    expect(await syncAppointmentToCalendar(ctx, agentId, id, { ...event, start: new Date("2026-11-04T10:00:00Z") })).toBe(id);
    expect(calls.at(-1)!.method).toBe("PATCH");
    expect(await syncAppointmentToCalendar(ctx, agentId, id, null)).toBeNull();
    expect(calls.at(-1)!.method).toBe("DELETE");
  });

  it("sends an approved reply from the agent's Outlook and refreshes an expired token", async () => {
    stub();
    // A token that expired an hour ago must be refreshed before sending.
    const { sealCredentials } = await import("../integrations/oauth");
    await db
      .update(schema.calendarConnections)
      .set({ credentials: sealCredentials({ accessToken: "old", refreshToken: "refresh-1", expiresAt: Date.now() - 3600_000 }) })
      .where(eq(schema.calendarConnections.agentId, agentId));
    const [contact] = await db.insert(schema.contacts).values({ agencyId, firstName: "An", email: "an@example.be" }).returning();
    const conversation = await conversationFor(ctx, { contactId: contact!.id, agentId, subject: "Uw bezoek" });
    expect(conversation.provider).toBe("outlook");
    const sent = await sendMessage(ctx, { conversationId: conversation.id, body: "Dag An" });
    expect(sent).toMatchObject({ delivery: "sent", transport: "outlook" });
    const mail = calls.at(-1)!;
    expect(mail.url).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
    expect(mail.auth).toBe("Bearer access-2");
    expect(mail.body).toMatchObject({ message: { subject: "Uw bezoek", toRecipients: [{ emailAddress: { address: "an@example.be" } }] }, saveToSentItems: true });
    const [row] = await db.select().from(schema.calendarConnections).where(and(eq(schema.calendarConnections.agentId, agentId)));
    const { decrypt } = await import("../crypto");
    expect(JSON.parse(decrypt(row!.credentials)).refreshToken).toBe("refresh-2");
  });
});
