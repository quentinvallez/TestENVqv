import { AGENCY_TIMEZONE } from "@viewing/core/time";

const tz = AGENCY_TIMEZONE;

export function formatPrice(price: number | null | undefined, transaction?: "sale" | "rent") {
  if (price == null) return "Price on request";
  const amount = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(price);
  return transaction === "rent" ? `${amount}/mo` : amount;
}

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDay(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(date);
}

export function formatDateTime(date: Date) {
  return `${formatDay(date)} · ${formatTime(date)}`;
}

export function formatRelative(date: Date, now = new Date()) {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDay(date);
}

export function fullName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(" ") || "Unknown";
}

export function address(street?: string | null, number?: string | null, city?: string | null) {
  return [[street, number].filter(Boolean).join(" "), city].filter(Boolean).join(", ");
}
