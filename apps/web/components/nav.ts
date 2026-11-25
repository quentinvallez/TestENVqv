import { Building2, CalendarDays, ClipboardList, LayoutGrid, Settings, UserRound, Users, type LucideIcon } from "lucide-react";
import { msg } from "@/lib/i18n";

/** `also`: other pages that belong to this entry (highlighted with it). */
export type NavItem = { href: string; label: string; icon: LucideIcon; also?: string[] };

/*
 * Leads board, Appointments and Widget previews have no menu entry: their pages
 * still work by address (/leads, /appointments, /previews; previews are for our
 * own sales use). Book a caller from Calendar → "Book" (/appointments/new).
 */
export const navSections: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: msg("Dashboard"), icon: LayoutGrid },
      { href: "/requests", label: msg("Viewing requests"), icon: ClipboardList },
      { href: "/calendar", label: msg("Calendar"), icon: CalendarDays, also: ["/appointments"] },
    ],
  },
  {
    title: msg("Records"),
    items: [
      { href: "/listings", label: msg("Listings"), icon: Building2 },
      { href: "/contacts", label: msg("Contacts"), icon: UserRound },
      { href: "/agents", label: msg("Agents"), icon: Users },
    ],
  },
  {
    items: [{ href: "/settings", label: msg("Settings"), icon: Settings, also: ["/widget"] }],
  },
];

export function navItemActive(item: Pick<NavItem, "href" | "also">, pathname: string) {
  if (item.href === "/") return pathname === "/";
  return [item.href, ...(item.also ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`));
}
