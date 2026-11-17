import { and, desc, eq, gte, inArray, schema, sql } from "@viewing/db";
import { z } from "zod";
import { defineTool } from "../tool";

const { events, appointments, listings } = schema;

export const recentActivity = defineTool({
  name: "activity_recent",
  description: "Most recent events in the agency's activity log.",
  mutates: false,
  input: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
  run: async (ctx, input) => {
    return ctx.db
      .select()
      .from(events)
      .where(eq(events.agencyId, ctx.agencyId))
      .orderBy(desc(events.createdAt))
      .limit(input.limit);
  },
});

/** Planning time one viewing costs an agency without us: calls, emails, agenda juggling. */
export const MINUTES_SAVED_PER_VIEWING = 30;

export const dashboardSummary = defineTool({
  name: "dashboard_summary",
  description: `Key numbers for the agency: viewings planned with the tool (all time, cancelled ones left out), how many are still to come, active listings, and the planning time saved (${MINUTES_SAVED_PER_VIEWING} minutes per viewing).`,
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const now = new Date();
    const count = sql<number>`count(*)::int`;
    const planned = and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.type, "viewing"), inArray(appointments.status, ["scheduled", "confirmed", "completed", "no_show"]));
    const [[total], [upcoming], [activeListings]] = await Promise.all([
      ctx.db.select({ n: count }).from(appointments).where(planned),
      ctx.db
        .select({ n: count })
        .from(appointments)
        .where(and(planned, inArray(appointments.status, ["scheduled", "confirmed"]), gte(appointments.startsAt, now))),
      ctx.db.select({ n: count }).from(listings).where(and(eq(listings.agencyId, ctx.agencyId), inArray(listings.status, ["active", "under_offer"]))),
    ]);
    const viewingsPlanned = total?.n ?? 0;
    return {
      viewingsPlanned,
      upcomingViewings: upcoming?.n ?? 0,
      minutesSaved: viewingsPlanned * MINUTES_SAVED_PER_VIEWING,
      minutesPerViewing: MINUTES_SAVED_PER_VIEWING,
      activeListings: activeListings?.n ?? 0,
    };
  },
});
