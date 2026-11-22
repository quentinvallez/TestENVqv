import { db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { expandShortLinks } from "../channels/short-links";
import { mayCreateLogin, signupByToken } from "../public";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";
import { applySignupRetention, SIGNUP_RETENTION_DAYS } from "./signups";

describe.skipIf(!process.env.DATABASE_URL)("workspace requests", () => {
  const platformId = newId("org");
  const ownerId = newId("usr");
  const ctx: ToolContext = { db, agencyId: platformId, actor: { type: "contact", id: null } };
  const admin: ToolContext = { db, agencyId: platformId, actor: { type: "user", id: ownerId } };
  const email = `${newId("x")}@immo-peeters.be`;

  beforeAll(async () => {
    vi.stubEnv("PLATFORM_AGENCY_ID", platformId);
    await db.insert(schema.organization).values({ id: platformId, name: "Unbird", slug: platformId, createdAt: new Date() });
    await db.insert(schema.user).values({ id: ownerId, name: "Quentin", email: `${ownerId}@unbird.io`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
    await db.insert(schema.member).values({ id: newId("mem"), organizationId: platformId, userId: ownerId, role: "owner", createdAt: new Date() });
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, platformId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    vi.unstubAllEnvs();
  });

  it("takes a request, tells the platform's admins, approves it with a link in the requester's language and lets that link make one workspace", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-test");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.be");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "<x>" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const asked = await runTool(tools.requestSignup, ctx, { agencyName: "Immo Peeters", website: "immopeeters.be", name: "Sofie Peeters", email: email.toUpperCase(), language: "fr" });
    expect(asked.repeated).toBe(false);
    const toUs = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(toUs.get("to")).toContain(`${ownerId}@unbird.io`);
    expect(toUs.get("subject")).toBe("Workspace request: Immo Peeters");
    expect(await expandShortLinks(db, toUs.get("text")!)).toContain("/signups");

    // Asking again: the same request, no second email.
    expect((await runTool(tools.requestSignup, ctx, { agencyName: "Immo Peeters", name: "Sofie Peeters", email })).repeated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Nobody can make a login for that address before we approve.
    expect(await mayCreateLogin(email)).toBe(false);

    const [listed] = await runTool(tools.listSignups, admin, {});
    expect(listed).toMatchObject({ id: asked.id, status: "pending", website: "https://immopeeters.be", language: "fr" });

    const approved = await runTool(tools.approveSignup, admin, { requestId: asked.id });
    expect(approved.delivery).toBe("sent");
    const toThem = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(toThem.get("to")).toContain(email);
    expect(toThem.get("subject")).toBe("Votre espace Unbird est prêt");
    expect(await expandShortLinks(db, toThem.get("text")!)).toContain(approved.link);
    const token = approved.link.split("/join/")[1]!;
    expect(await mayCreateLogin(email)).toBe(true);
    expect(await signupByToken(token)).toMatchObject({ state: "open", agencyName: "Immo Peeters", hasAccount: false });

    // Only the login with the request's email can take it, and only once.
    await expect(runTool(tools.claimSignup, admin, { token, email: "someone@else.be", dpaVersion: null })).rejects.toThrow("doesn't work");
    const claimed = await runTool(tools.claimSignup, admin, { token, email, dpaVersion: "1" });
    expect(claimed.agencyName).toBe("Immo Peeters");
    await expect(runTool(tools.claimSignup, admin, { token, email, dpaVersion: "1" })).rejects.toThrow("doesn't work");
    expect(await signupByToken(token)).toMatchObject({ state: "used" });
    expect(await mayCreateLogin(email)).toBe(false);

    // Creating the workspace failed: the link works again.
    await runTool(tools.releaseSignup, admin, { requestId: claimed.id });
    expect(await signupByToken(token)).toMatchObject({ state: "open" });
    await runTool(tools.claimSignup, admin, { token, email, dpaVersion: "1" });
    await runTool(tools.finishSignup, admin, { requestId: claimed.id, createdAgencyId: platformId });
    const [done] = await db.select().from(schema.signupRequests).where(eq(schema.signupRequests.id, claimed.id));
    expect(done).toMatchObject({ status: "completed", createdAgencyId: platformId, dpaVersion: "1" });
    expect(done!.dpaAcceptedAt).toBeInstanceOf(Date);
    vi.unstubAllGlobals();
  });

  it("declines without telling anyone, stops a sent link and forgets old requests", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "");
    const other = `${newId("x")}@immo-zone.be`;
    const asked = await runTool(tools.requestSignup, ctx, { agencyName: "Immo Zone", name: "Marc Janssens", email: other });
    const approved = await runTool(tools.approveSignup, admin, { requestId: asked.id });
    expect(approved.delivery).toBe("simulated");
    await runTool(tools.declineSignup, admin, { requestId: asked.id });
    expect(await signupByToken(approved.link.split("/join/")[1]!)).toBeNull();
    expect(await mayCreateLogin(other)).toBe(false);

    expect(await applySignupRetention(admin, new Date(Date.now() + (SIGNUP_RETENTION_DAYS + 1) * 86_400_000))).toBeGreaterThanOrEqual(1);
    const [left] = await db.select().from(schema.signupRequests).where(eq(schema.signupRequests.id, asked.id));
    expect(left).toBeUndefined();
  });

  it("lets an invited agent make a login", async () => {
    const invited = `${newId("x")}@immo-peeters.be`;
    await db.insert(schema.invitation).values({ id: newId("inv"), organizationId: platformId, email: invited, role: "member", status: "pending", expiresAt: new Date(Date.now() + 86_400_000), inviterId: ownerId });
    expect(await mayCreateLogin(invited.toUpperCase())).toBe(true);
  });
});
