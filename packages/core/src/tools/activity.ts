import { and, desc, eq, gte, inArray, schema, sql } from "@viewing/db";
import { z } from "zod";
import { startOfZonedDay } from "../time";
import { defineTool } from "../tool";

const { events, leads, appointments, listings, proposals } = schema;

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

export const dashboardSummary = defineTool({
  name: "dashboard_summary",
  description: "Key numbers for the agency: new leads this week, viewings today and this week, active listings, pending approvals.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const now = new Date();
    const startOfDay = startOfZonedDay(now);
    const endOfDay = startOfZonedDay(now, 1);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const weekAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const count = sql<number>`count(*)::int`;
    const booked = inArray(appointments.status, ["scheduled", "confirmed"]);

    const [[newLeads], [viewingsToday], [viewingsWeek], [activeListings], [pending]] = await Promise.all([
      ctx.db.select({ n: count }).from(leads).where(and(eq(leads.agencyId, ctx.agencyId), gte(leads.createdAt, weekAgo))),
      ctx.db
        .select({ n: count })
        .from(appointments)
        .where(and(eq(appointments.agencyId, ctx.agencyId), booked, gte(appointments.startsAt, startOfDay), sql`${appointments.startsAt} < ${endOfDay}`)),
      ctx.db
        .select({ n: count })
        .from(appointments)
        .where(and(eq(appointments.agencyId, ctx.agencyId), booked, gte(appointments.startsAt, now), sql`${appointments.startsAt} < ${weekAhead}`)),
      ctx.db.select({ n: count }).from(listings).where(and(eq(listings.agencyId, ctx.agencyId), inArray(listings.status, ["active", "under_offer"]))),
      ctx.db.select({ n: count }).from(proposals).where(and(eq(proposals.agencyId, ctx.agencyId), eq(proposals.status, "pending"))),
    ]);

    return {
      newLeadsThisWeek: newLeads?.n ?? 0,
      viewingsToday: viewingsToday?.n ?? 0,
      viewingsNext7Days: viewingsWeek?.n ?? 0,
      activeListings: activeListings?.n ?? 0,
      pendingApprovals: pending?.n ?? 0,
    };
  },
});
