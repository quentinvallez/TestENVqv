"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, Inbox, KanbanSquare, LayoutGrid, LogOut, Menu, Search, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { openCommandMenu } from "./command-menu";
import { navSections } from "./nav";

const tabs = [
  { href: "/", label: "Home", icon: LayoutGrid },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/leads", label: "Leads", icon: KanbanSquare },
];

/** Bottom tab bar on phones, with everything else behind "More". */
export function MobileTabBar({ agencyName, userName, inboxCount }: { agencyName: string; userName: string; inboxCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const inMore = !tabs.some((t) => isActive(t.href));

  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <>
      <nav className="flex shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn("relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", isActive(tab.href) ? "text-fg" : "text-faint")}
          >
            <tab.icon className="size-5" strokeWidth={isActive(tab.href) ? 2.25 : 1.75} />
            {tab.label}
            {tab.href === "/inbox" && inboxCount > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-4 rounded-full bg-ai px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">
                {inboxCount}
              </span>
            )}
          </Link>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn("flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", inMore ? "text-fg" : "text-faint")}
        >
          <Menu className="size-5" strokeWidth={inMore ? 2.25 : 1.75} />
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/30 md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="w-full rounded-t-2xl border-t border-line bg-panel pb-[calc(env(safe-area-inset-bottom)+8px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="font-semibold">{agencyName}</span>
              <button onClick={() => setMoreOpen(false)} className="-mr-2 p-2 text-muted" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <button
              onClick={() => {
                setMoreOpen(false);
                openCommandMenu();
              }}
              className="mx-4 mb-2 flex h-11 w-[calc(100%-2rem)] items-center gap-2 rounded-lg border border-line px-3 text-muted"
            >
              <Search className="size-4" />
              Search or ask…
            </button>
            <div className="grid grid-cols-2 gap-1 px-3">
              {navSections
                .flatMap((s) => s.items)
                .filter((item) => !tabs.some((t) => t.href === item.href) && !item.soon)
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn("flex h-12 items-center gap-3 rounded-lg px-3", isActive(item.href) ? "bg-hover font-medium" : "text-muted")}
                  >
                    <item.icon className="size-5" strokeWidth={1.75} />
                    {item.label}
                  </Link>
                ))}
            </div>
            <div className="mx-4 mt-2 flex items-center justify-between border-t border-line pt-3 text-muted">
              <span className="truncate">{userName}</span>
              <button
                onClick={async () => {
                  await authClient.signOut();
                  router.push("/login");
                }}
                className="flex h-10 items-center gap-2 px-2"
              >
                <LogOut className="size-4" />
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
