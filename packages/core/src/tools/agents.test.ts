import { db, eq, newId, schema } from "@viewing/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tools } from "../registry";
import { runTool, type ToolContext } from "../tool";

describe.skipIf(!process.env.DATABASE_URL)("agents", () => {
  const agencyId = newId("org");
  const ctx: ToolContext = { db, agencyId, actor: { type: "user", id: null } };

  beforeAll(async () => {
    await db.insert(schema.organization).values({ id: agencyId, name: "Agents test", slug: agencyId, createdAt: new Date() });
  });
  afterAll(async () => {
    await db.delete(schema.organization).where(eq(schema.organization.id, agencyId));
  });

  it("adds an agent with a personal address and changes it", async () => {
    const agent = await runTool(tools.createAgent, ctx, { name: "Quentin", email: "Quentin@Live.be" });
    expect(agent.email).toBe("quentin@live.be");
    const updated = await runTool(tools.updateAgent, ctx, { agentId: agent.id, email: "quentin@gmail.com" });
    expect(updated.email).toBe("quentin@gmail.com");
    const cleared = await runTool(tools.updateAgent, ctx, { agentId: agent.id, email: null });
    expect(cleared.email).toBeNull();
  });

  it("refuses an address another agent already uses", async () => {
    await runTool(tools.createAgent, ctx, { name: "Sofie", email: "sofie@example.be" });
    const other = await runTool(tools.createAgent, ctx, { name: "Tom" });
    await expect(runTool(tools.updateAgent, ctx, { agentId: other.id, email: "sofie@example.be" })).rejects.toThrow(/already uses/);
  });
});
