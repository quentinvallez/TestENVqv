import type { Database, Transaction } from "@viewing/db";
import type { ActorType } from "@viewing/db/schema";
import { z } from "zod";

export type ToolContext = {
  db: Database | Transaction;
  agencyId: string;
  actor: { type: ActorType; id: string | null };
};

export type Tool<I extends z.ZodType = z.ZodType, O = unknown> = {
  name: string;
  description: string;
  input: I;
  /** False for read-only tools; agents may call those without approval. */
  mutates: boolean;
  run: (ctx: ToolContext, input: z.output<I>) => Promise<O>;
};

/**
 * Every action in the product is a tool: the UI, the API, our AI agents and
 * external assistants (via MCP) all go through the same definitions.
 */
export function defineTool<I extends z.ZodType, O>(tool: Tool<I, O>): Tool<I, O> {
  return tool;
}

export async function runTool<I extends z.ZodType, O>(
  tool: Tool<I, O>,
  ctx: ToolContext,
  input: z.input<I>,
): Promise<O> {
  return tool.run(ctx, tool.input.parse(input));
}

/** Tool descriptions in the JSON Schema format LLM tool-use APIs expect. */
export function describeTools(tools: Record<string, Tool>) {
  return Object.values(tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: z.toJSONSchema(tool.input),
  }));
}
