import {
  BarChart3,
  Building2,
  CalendarDays,
  Code2,
  Inbox,
  KanbanSquare,
  LayoutGrid,
  Settings,
  UserRound,
  Users,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; soon?: boolean };

export const navSections: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutGrid },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Records",
    items: [
      { href: "/listings", label: "Listings", icon: Building2 },
      { href: "/leads", label: "Leads", icon: KanbanSquare },
      { href: "/appointments", label: "Appointments", icon: CalendarCheck },
      { href: "/contacts", label: "Contacts", icon: UserRound },
      { href: "/agents", label: "Agents", icon: Users },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/widget", label: "Booking widget", icon: Code2 },
      { href: "/reports", label: "Reports", icon: BarChart3, soon: true },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
