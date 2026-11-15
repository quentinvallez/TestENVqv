import "server-only";
import { qualificationQuestions, runTool, tools } from "@viewing/core";
import { bookableListing, publicContext } from "@viewing/core/public";
import { groupSlotsByDay } from "./slots";
import type { WidgetLang } from "./widget-i18n";
import { AGENCY_TIMEZONE } from "@viewing/core/time";

const locales = { nl: "nl-BE", fr: "fr-BE", en: "en-GB", de: "de-BE" } as const;

/** Upcoming open houses as the visitor reads them: "za 28 nov · 10:00–12:00" and the places left. */
function openHouseBanners(shows: { startsAt: Date; endsAt: Date; placesLeft: number }[], lang: WidgetLang) {
  const day = new Intl.DateTimeFormat(locales[lang], { timeZone: AGENCY_TIMEZONE, weekday: "short", day: "numeric", month: "short" });
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, hour: "2-digit", minute: "2-digit" });
  return shows.slice(0, 3).map((o) => ({ when: `${day.format(o.startsAt)} · ${time.format(o.startsAt)}–${time.format(o.endsAt)}`, placesLeft: o.placesLeft }));
}

/** Everything the booking widget needs for one listing, in the visitor's language. */
export async function loadWidget(listingId: string, lang: WidgetLang, agentId?: string) {
  const found = await bookableListing(listingId);
  if (!found) return null;
  const { agent, slotMinutes, slots, awaitingOccupant, openHouses } = await runTool(tools.availableSlots, publicContext(found.listing.agencyId), { listingId, agentId, days: 14 });
  const questions = qualificationQuestions[found.listing.transaction].map((q) => ({
    id: q.id,
    question: q.question[lang],
    options: q.options.map((o) => ({ id: o.id, label: o.label[lang] })),
  }));
  return { ...found, agent, slotMinutes, awaitingOccupant, days: groupSlotsByDay(slots, lang), questions, openHouses: openHouseBanners(openHouses, lang) };
}
