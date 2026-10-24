import { AGENCY_TIMEZONE } from "@viewing/core/time";

export type SlotDay = { key: string; weekday: string; date: string; slots: { value: string; label: string }[] };

/** Groups slots by local day with display labels, so client components need no time zone logic. */
const locales = { nl: "nl-BE", fr: "fr-BE", en: "en-GB" } as const;

export function groupSlotsByDay(slots: { start: Date }[], lang: keyof typeof locales = "en"): SlotDay[] {
  const keyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: AGENCY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const weekdayFormat = new Intl.DateTimeFormat(locales[lang], { timeZone: AGENCY_TIMEZONE, weekday: "short" });
  const dateFormat = new Intl.DateTimeFormat(locales[lang], { timeZone: AGENCY_TIMEZONE, day: "numeric", month: "short" });
  const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TIMEZONE, hour: "2-digit", minute: "2-digit" });

  const days = new Map<string, SlotDay>();
  for (const slot of slots) {
    const key = keyFormat.format(slot.start);
    if (!days.has(key)) days.set(key, { key, weekday: weekdayFormat.format(slot.start), date: dateFormat.format(slot.start), slots: [] });
    days.get(key)!.slots.push({ value: slot.start.toISOString(), label: timeFormat.format(slot.start) });
  }
  return [...days.values()];
}
