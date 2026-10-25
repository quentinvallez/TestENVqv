import { authorizedFetch } from "../integrations/oauth";
import type { Interval } from "../planner/availability";
import type { CalendarEvent, CalendarProvider } from "./index";

const api = "https://graph.microsoft.com/v1.0";

// No attendees, for the same reason as Google: Outlook would send the client an invitation.
function toGraph(event: CalendarEvent) {
  return {
    subject: event.title,
    body: { contentType: "text", content: event.description ?? "" },
    start: { dateTime: event.start.toISOString().slice(0, 19), timeZone: "UTC" },
    end: { dateTime: event.end.toISOString().slice(0, 19), timeZone: "UTC" },
    location: event.location ? { displayName: event.location } : undefined,
  };
}

type GraphEvent = { showAs?: string; isCancelled?: boolean; start: { dateTime: string }; end: { dateTime: string } };

export const microsoft: CalendarProvider = {
  async busy(ctx, connection, from, to) {
    const busy: Interval[] = [];
    let url: string | undefined =
      `${api}/me/calendarView?` + new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString(), $select: "start,end,showAs,isCancelled", $top: "200" });
    // Follow paging, with a cap so a huge calendar can't stall a booking page.
    for (let page = 0; url && page < 5; page++) {
      const response = await authorizedFetch(ctx, connection, url, { headers: { prefer: 'outlook.timezone="UTC"' } });
      const body = (await response.json()) as { value: GraphEvent[]; "@odata.nextLink"?: string };
      for (const e of body.value) {
        if (e.isCancelled || e.showAs === "free" || e.showAs === "workingElsewhere") continue;
        busy.push({ start: new Date(`${e.start.dateTime.slice(0, 19)}Z`), end: new Date(`${e.end.dateTime.slice(0, 19)}Z`) });
      }
      url = body["@odata.nextLink"];
    }
    return busy;
  },
  async createEvent(ctx, connection, event) {
    const response = await authorizedFetch(ctx, connection, `${api}/me/events`, { method: "POST", body: JSON.stringify(toGraph(event)) });
    return ((await response.json()) as { id: string }).id;
  },
  async updateEvent(ctx, connection, eventId, event) {
    await authorizedFetch(ctx, connection, `${api}/me/events/${encodeURIComponent(eventId)}`, { method: "PATCH", body: JSON.stringify(toGraph(event)) });
  },
  async deleteEvent(ctx, connection, eventId) {
    await authorizedFetch(ctx, connection, `${api}/me/events/${encodeURIComponent(eventId)}`, { method: "DELETE" }).catch((error: Error) => {
      if (!/ 404 /.test(error.message)) throw error;
    });
  },
};
