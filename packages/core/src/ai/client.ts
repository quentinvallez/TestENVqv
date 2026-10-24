import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const AI_MODEL = "claude-opus-5-5";

/** True when Claude can be called; otherwise agents fall back to templates. */
export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

let client: Anthropic | undefined;

/**
 * One Claude call that returns data matching `schema`. Refusals fall back to
 * another model server-side; anything else that prevents an answer throws, so
 * callers can use their template fallback.
 */
export async function generateStructured<S extends z.ZodType>(options: {
  system: string;
  prompt: string;
  schema: S;
  effort?: "low" | "medium" | "high";
}): Promise<z.output<S>> {
  if (!aiAvailable()) throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: options.effort ?? "medium", format: betaZodOutputFormat(options.schema) },
    system: options.system,
    messages: [{ role: "user", content: options.prompt }],
  });
  if (response.stop_reason === "refusal") throw new AiUnavailableError("The model declined this request");
  if (response.parsed_output == null) throw new AiUnavailableError(`No structured output (stop reason: ${response.stop_reason})`);
  return response.parsed_output as z.output<S>;
}
