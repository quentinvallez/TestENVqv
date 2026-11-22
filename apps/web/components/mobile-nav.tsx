"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, CalendarDays, ClipboardList, LayoutGrid, LogOut, Menu, Search, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { openCommandMenu } from "./command-menu";
import { navItemActive, navSections } from "./nav";

const tabs = [
  { href: "/", label: "Home", icon: LayoutGrid },
  { href: "/requests", label: "Requests", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, also: ["/appointments"] },
  { href: "/listings", label: "Listings", icon: Building2 },
];

/** Bottom tab bar on phones, with everything else behind "More". */
export function MobileTabBar({ agencyName, userName, myAgentId, needsYouCount }: { agencyName: string; userName: string; myAgentId: string | null; needsYouCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = !tabs.some((t) => navItemActive(t, pathname));

  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <>
      <nav className="flex shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn("relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", navItemActive(tab, pathname) ? "text-fg" : "text-faint")}
          >
            <tab.icon className="size-5" strokeWidth={navItemActive(tab, pathname) ? 2.25 : 1.75} />
            {tab.label}
            {tab.href === "/requests" && needsYouCount > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">
                {needsYouCount}
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
                .filter((item) => !tabs.some((t) => t.href === item.href))
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn("flex h-12 items-center gap-3 rounded-lg px-3", navItemActive(item, pathname) ? "bg-hover font-medium" : "text-muted")}
                  >
                    <item.icon className="size-5" strokeWidth={1.75} />
                    {item.label}
                  </Link>
                ))}
            </div>
            <div className="mx-4 mt-2 flex items-center justify-between border-t border-line pt-3 text-muted">
              {myAgentId ? (
                <Link href={`/agents/${myAgentId}`} className="flex h-10 min-w-0 items-center gap-2">
                  <span className="truncate text-fg">{userName}</span>
                  <span className="shrink-0 text-[12px]">· My page</span>
                </Link>
              ) : (
                <span className="truncate">{userName}</span>
              )}
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
