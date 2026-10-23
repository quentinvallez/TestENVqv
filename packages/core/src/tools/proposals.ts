import { and, desc, eq, schema } from "@viewing/db";
import { z } from "zod";
import { recordEvent } from "../events";
import { defineTool } from "../tool";

const { proposals } = schema;

export const listProposals = defineTool({
  name: "proposals_list",
  description: "List actions AI agents have proposed that are waiting for a human decision.",
  mutates: false,
  input: z.object({ status: z.enum(["pending", "approved", "rejected", "executed", "failed"]).default("pending") }),
  run: async (ctx, input) => {
    return ctx.db
      .select()
      .from(proposals)
      .where(and(eq(proposals.agencyId, ctx.agencyId), eq(proposals.status, input.status)))
      .orderBy(desc(proposals.createdAt));
  },
});

export const decideProposal = defineTool({
  name: "proposals_decide",
  description: "Approve or reject a pending proposal from an AI agent.",
  mutates: true,
  input: z.object({ proposalId: z.string(), decision: z.enum(["approved", "rejected"]) }),
  run: async (ctx, input) => {
    const [updated] = await ctx.db
      .update(proposals)
      .set({ status: input.decision, decidedBy: ctx.actor.type === "user" ? ctx.actor.id : null, decidedAt: new Date() })
      .where(and(eq(proposals.agencyId, ctx.agencyId), eq(proposals.id, input.proposalId), eq(proposals.status, "pending")))
      .returning();
    if (!updated) throw new Error("Proposal not found or already decided");
    await recordEvent(ctx, {
      type: `proposal.${input.decision}`,
      subjectType: "proposal",
      subjectId: updated.id,
      data: { toolName: updated.toolName },
    });
    if (input.decision === "rejected") return updated;

    // Approving runs the proposed tool with the proposed input, on behalf of the approver.
    const { toolsByName } = await import("../registry");
    const tool = toolsByName[updated.toolName];
    let status: "executed" | "failed" = "executed";
    let result: Record<string, unknown>;
    try {
      if (!tool) throw new Error(`Unknown tool ${updated.toolName}`);
      result = { output: (await tool.run(ctx, tool.input.parse(updated.input))) ?? null };
    } catch (error) {
      status = "failed";
      result = { error: error instanceof Error ? error.message : String(error) };
    }
    const [final] = await ctx.db.update(proposals).set({ status, result }).where(eq(proposals.id, updated.id)).returning();
    return final!;
  },
});
