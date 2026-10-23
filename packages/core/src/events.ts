import { schema } from "@viewing/db";
import { Inngest } from "inngest";
import type { ToolContext } from "./tool";

export const inngest = new Inngest({ id: "viewing" });

type EventInput = {
  type: string;
  subjectType: string;
  subjectId: string;
  data?: Record<string, unknown>;
};

/**
 * Appends to the event log and publishes the event so agent workflows can react.
 * Publishing is skipped until Inngest is configured for the environment.
 */
export async function recordEvent(ctx: ToolContext, event: EventInput) {
  const [row] = await ctx.db
    .insert(schema.events)
    .values({
      agencyId: ctx.agencyId,
      type: event.type,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      actorType: ctx.actor.type,
      actorId: ctx.actor.id,
      data: event.data ?? {},
    })
    .returning();

  if (process.env.INNGEST_EVENT_KEY || process.env.INNGEST_DEV) {
    await inngest.send({
      name: event.type,
      data: { eventId: row!.id, agencyId: ctx.agencyId, subjectId: event.subjectId, ...event.data },
    });
  }
  return row!;
}
