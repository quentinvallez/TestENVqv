import "server-only";
import { qualificationQuestions, runTool, tools } from "@viewing/core";
import { bookableListing, publicContext } from "@viewing/core/public";
import { groupSlotsByDay } from "./slots";
import type { WidgetLang } from "./widget-i18n";

/** Everything the booking widget needs for one listing, in the visitor's language. */
export async function loadWidget(listingId: string, lang: WidgetLang, agentId?: string) {
  const found = await bookableListing(listingId);
  if (!found) return null;
  const { agent, slotMinutes, slots } = await runTool(tools.availableSlots, publicContext(found.listing.agencyId), { listingId, agentId, days: 14 });
  const questions = qualificationQuestions[found.listing.transaction].map((q) => ({
    id: q.id,
    question: q.question[lang],
    options: q.options.map((o) => ({ id: o.id, label: o.label[lang] })),
  }));
  return { ...found, agent, slotMinutes, days: groupSlotsByDay(slots, lang), questions };
}
