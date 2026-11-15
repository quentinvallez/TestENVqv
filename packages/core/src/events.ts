import { schema } from "@viewing/db";
import type { ToolContext } from "./tool";

type EventInput = {
  type: string;
  subjectType: string;
  subjectId: string;
  data?: Record<string, unknown>;
};

/** Appends to the event log (the activity feed and the agents' memory). */
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

  return row!;
}
