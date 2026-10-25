import { authorizedFetch } from "../integrations/oauth";
import type { CalendarEvent, CalendarProvider } from "./index";

const api = "https://www.googleapis.com/calendar/v3";

// The client is not added as an attendee: Google would email them an invitation
// from the agent, and nothing reaches a client without a human approving it.
function toGoogle(event: CalendarEvent) {
  return {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: { dateTime: event.start.toISOString() },
    end: { dateTime: event.end.toISOString() },
    reminders: { useDefault: true },
  };
}

export const google: CalendarProvider = {
  async busy(ctx, connection, from, to) {
    const response = await authorizedFetch(ctx, connection, `${api}/freeBusy`, {
      method: "POST",
      body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: "primary" }] }),
    });
    const body = (await response.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
    return (body.calendars?.primary?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  },
  async createEvent(ctx, connection, event) {
    const response = await authorizedFetch(ctx, connection, `${api}/calendars/primary/events?sendUpdates=none`, { method: "POST", body: JSON.stringify(toGoogle(event)) });
    return ((await response.json()) as { id: string }).id;
  },
  async updateEvent(ctx, connection, eventId, event) {
    await authorizedFetch(ctx, connection, `${api}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: "PATCH", body: JSON.stringify(toGoogle(event)) });
  },
  async deleteEvent(ctx, connection, eventId) {
    await authorizedFetch(ctx, connection, `${api}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: "DELETE" }).catch((error: Error) => {
      // Already deleted by the agent in their own calendar.
      if (!/ (404|410) /.test(error.message)) throw error;
    });
  },
};
