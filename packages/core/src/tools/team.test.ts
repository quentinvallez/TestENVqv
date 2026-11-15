import { and, db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agencyOfUser } from "../public";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";

describe.skipIf(!process.env.DATABASE_URL)("team logins", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };
  const ownerId = newId("usr");
  const sofieUserId = newId("usr");

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Immo Team", slug: agencyId, createdAt: new Date() });
    await db.insert(schema.user).values([
      { id: ownerId, name: "Owner", email: `${ownerId}@example.be`, emailVerified: false, createdAt: new Date(), updatedAt: new Date() },
      { id: sofieUserId, name: "Sofie", email: `${sofieUserId}@example.be`, emailVerified: false, createdAt: new Date(), updatedAt: new Date() },
    ]);
    await db.insert(schema.member).values({ id: newId("mem"), organizationId: agencyId, userId: ownerId, role: "owner", createdAt: new Date() });
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.user).where(eq(schema.user.id, sofieUserId));
  });

  it("invites an agent, emails the link in their language and ties the login to the agent", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-test");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.be");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "<x>" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const email = `${sofieUserId}@example.be`;
    const [agent] = await db.insert(schema.agents).values({ agencyId, name: "Sofie Peeters", email, languages: ["fr"] }).returning();
    expect((await runTool(tools.getAgentLogin, ctx, { agentId: agent!.id })).login.status).toBe("none");

    const invitationId = newId("inv");
    await db.insert(schema.invitation).values({ id: invitationId, organizationId: agencyId, email, role: "member", status: "pending", expiresAt: new Date(Date.now() + 7 * 86_400_000), inviterId: ownerId });
    const invited = await runTool(tools.getAgentLogin, ctx, { agentId: agent!.id });
    expect(invited.login).toMatchObject({ status: "invited", invitationId, expired: false });
    expect(invited.link).toMatch(new RegExp(`/invite/${invitationId}$`));

    const sent = await runTool(tools.sendInvitationEmail, ctx, { invitationId, inviterName: "Marc" });
    expect(sent.delivery).toBe("sent");
    const form = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(form.get("to")).toContain(email);
    expect(form.get("subject")).toBe("Invitation : connectez-vous chez Immo Team");
    expect(form.get("text")).toContain(`/invite/${invitationId}`);
    expect(form.get("text")).toContain("Marc vous invite");

    // Accepted: Better Auth adds the member, the hook ties it to the agent.
    await db.update(schema.invitation).set({ status: "accepted" }).where(eq(schema.invitation.id, invitationId));
    await db.insert(schema.member).values({ id: newId("mem"), organizationId: agencyId, userId: sofieUserId, role: "member", createdAt: new Date() });
    const linked = await runTool(tools.linkAgentLogin, ctx, { userId: sofieUserId, email: email.toUpperCase() });
    expect(linked.agentId).toBe(agent!.id);
    const joined = await runTool(tools.getAgentLogin, ctx, { agentId: agent!.id });
    expect(joined.login).toMatchObject({ status: "member", role: "member", userId: sofieUserId });

    const list = await runTool(tools.listAgents, ctx, {});
    expect(list.find((a) => a.id === agent!.id)?.login.status).toBe("member");

    await runTool(tools.unlinkAgentLogin, ctx, { agentId: agent!.id });
    const [after] = await db.select().from(schema.agents).where(and(eq(schema.agents.agencyId, agencyId), eq(schema.agents.id, agent!.id)));
    expect(after!.userId).toBeNull();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("emails a login of the agency the link to choose a new password, in the agent's language", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-test");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.be");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "<x>" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await agencyOfUser(ownerId)).toBe(agencyId);
    await db.insert(schema.agents).values({ agencyId, userId: ownerId, name: "Marc Owner", email: `${ownerId}@example.be`, languages: ["nl"] });
    const link = "http://localhost/api/auth/reset-password/tok?callbackURL=%2Freset-password";
    const sent = await runTool(tools.sendPasswordReset, ctx, { userId: ownerId, email: `${ownerId}@example.be`, link });
    expect(sent.delivery).toBe("sent");
    const form = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(form.get("subject")).toBe("Kies een nieuw wachtwoord");
    expect(form.get("text")).toContain("Dag Marc");
    expect(form.get("text")).toContain(link);
    // Someone who isn't a login of this agency gets nothing.
    await expect(runTool(tools.sendPasswordReset, ctx, { userId: newId("usr"), email: "x@example.be", link })).rejects.toThrow();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
