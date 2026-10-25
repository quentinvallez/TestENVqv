import { and, eq, schema } from "@viewing/db";
import type { Interval } from "../planner/availability";
import type { ToolContext } from "../tool";
import { google } from "./google";
import { microsoft } from "./microsoft";

type Connection = typeof schema.calendarConnections.$inferSelect;

export type CalendarEvent = {
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  attendeeEmail?: string;
};

/** What the planner needs from an agent's Google or Outlook calendar. */
export interface CalendarProvider {
  busy(ctx: ToolContext, connection: Connection, from: Date, to: Date): Promise<Interval[]>;
  createEvent(ctx: ToolContext, connection: Connection, event: CalendarEvent): Promise<string>;
  updateEvent(ctx: ToolContext, connection: Connection, eventId: string, event: CalendarEvent): Promise<void>;
  deleteEvent(ctx: ToolContext, connection: Connection, eventId: string): Promise<void>;
}

// Google Calendar and Microsoft Graph; the OAuth apps are described in docs/setup-calendars.md.
const providers: Partial<Record<Connection["provider"], CalendarProvider>> = { google, microsoft };

export function registerCalendarProvider(name: Connection["provider"], provider: CalendarProvider) {
  providers[name] = provider;
}

async function activeConnections(ctx: ToolContext, agentId: string) {
  const rows = await ctx.db
    .select()
    .from(schema.calendarConnections)
    .where(
      and(
        eq(schema.calendarConnections.agencyId, ctx.agencyId),
        eq(schema.calendarConnections.agentId, agentId),
        eq(schema.calendarConnections.status, "active"),
      ),
    )
    .orderBy(schema.calendarConnections.createdAt);
  return rows.filter((c) => c.scopes.includes("calendar"));
}

/**
 * Busy time from the agent's connected calendars. A calendar that cannot be
 * reached is skipped rather than blocking all bookings.
 */
export async function externalBusy(ctx: ToolContext, agentId: string, from: Date, to: Date): Promise<Interval[]> {
  const connections = await activeConnections(ctx, agentId);
  const results = await Promise.all(
    connections.map(async (connection) => {
      const provider = providers[connection.provider];
      if (!provider) return [];
      try {
        return await provider.busy(ctx, connection, from, to);
      } catch (error) {
        console.error(`Calendar busy lookup failed for ${connection.id}`, error);
        return [];
      }
    }),
  );
  return results.flat();
}

/** Writes the appointment to the agent's primary connected calendar, if any. */
export async function syncAppointmentToCalendar(
  ctx: ToolContext,
  agentId: string,
  externalEventId: string | null,
  event: CalendarEvent | null,
): Promise<string | null> {
  const [connection] = await activeConnections(ctx, agentId);
  const provider = connection && providers[connection.provider];
  if (!connection || !provider) return externalEventId;
  try {
    if (!event) {
      if (externalEventId) await provider.deleteEvent(ctx, connection, externalEventId);
      return null;
    }
    if (externalEventId) {
      await provider.updateEvent(ctx, connection, externalEventId, event);
      return externalEventId;
    }
    return await provider.createEvent(ctx, connection, event);
  } catch (error) {
    console.error(`Calendar sync failed for ${connection.id}`, error);
    return externalEventId;
  }
}
