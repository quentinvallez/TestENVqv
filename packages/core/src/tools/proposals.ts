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
    // Executing approved proposals arrives with the planner agent; for now the decision is recorded.
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
    return updated;
  },
});
