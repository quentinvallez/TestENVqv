import { Building2, CalendarDays, Inbox, LayoutGrid, Settings, UserRound, Users, type LucideIcon } from "lucide-react";

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
      { href: "/", label: "Dashboard", icon: LayoutGrid },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, also: ["/appointments"] },
    ],
  },
  {
    title: "Records",
    items: [
      { href: "/listings", label: "Listings", icon: Building2 },
      { href: "/contacts", label: "Contacts", icon: UserRound },
      { href: "/agents", label: "Agents", icon: Users },
    ],
  },
  {
    items: [{ href: "/settings", label: "Settings", icon: Settings, also: ["/widget"] }],
  },
];

export function navItemActive(item: Pick<NavItem, "href" | "also">, pathname: string) {
  if (item.href === "/") return pathname === "/";
  return [item.href, ...(item.also ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`));
}
