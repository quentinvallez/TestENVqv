import { computeSlots, type Interval, type WorkingHours } from "./availability";

/*
 * Sample free times for the widget preview: a made-up agent's week run through
 * the real slot engine, with a few viewings already booked so it looks like a
 * real agenda. The same preview shows the same times (seeded by its id).
 */

const WEEK: WorkingHours[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60 })),
  { weekday: 6, startMinute: 10 * 60, endMinute: 13 * 60 },
];

/** A small deterministic random sequence from a text, so a preview's agenda doesn't change between visits. */
function sequence(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function demoSlots(seed: string, now = new Date(), days = 10): Interval[] {
  const random = sequence(seed);
  const from = new Date(now);
  const to = new Date(now.getTime() + days * 24 * 3600 * 1000);
  // About three viewings a day already booked, on the hour or half hour.
  const busy: Interval[] = [];
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < 3; i++) {
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() + d);
      start.setUTCHours(8 + Math.floor(random() * 8), random() < 0.5 ? 0 : 30, 0, 0);
      busy.push({ start, end: new Date(start.getTime() + 45 * 60_000) });
    }
  }
  return computeSlots({ workingHours: WEEK, busy, from, to, slotMinutes: 30, bufferMinutes: 15, stepMinutes: 30, minNoticeMinutes: 12 * 60, now });
}
