"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { navSections } from "./nav";
import { openCommandMenu } from "./command-menu";

export function Sidebar({ agencyName, userName, inboxCount }: { agencyName: string; userName: string; inboxCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const signOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <aside className="hidden w-[232px] shrink-0 flex-col gap-4 px-3 py-4 md:flex">
      <div className="flex items-center gap-2 px-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[12px] font-semibold text-primary-fg">
          {agencyName.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-[14px] font-semibold tracking-tight">{agencyName}</span>
      </div>

      <button
        onClick={openCommandMenu}
        className="flex h-8 items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-muted transition-colors hover:border-line-strong"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search or ask…</span>
        <kbd className="rounded border border-line px-1 font-mono text-[10px]">⌘K</kbd>
      </button>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {navSections.map((section, i) => (
          <div key={i} className="flex flex-col gap-px">
            {section.title && <div className="px-2 pb-1 text-[11px] font-medium text-faint">{section.title}</div>}
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2 transition-colors",
                  isActive(item.href) ? "bg-hover font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg",
                )}
              >
                <item.icon className="size-4" strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
                {item.href === "/inbox" && inboxCount > 0 && (
                  <span className="rounded bg-ai-soft px-1.5 text-[11px] font-medium text-ai tabular-nums">{inboxCount}</span>
                )}
                {item.soon && <span className="text-[10px] text-faint">Soon</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-line px-2 pt-3 text-muted">
        <span className="flex size-6 items-center justify-center rounded-full bg-hover text-[11px] font-medium text-fg">
          {userName.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 truncate">{userName}</span>
        <button onClick={signOut} title="Log out" className="rounded p-1 hover:bg-hover hover:text-fg">
          <LogOut className="size-3.5" />
        </button>
      </div>
    </aside>
  );
}

/** Compact navigation for phones: one scrollable row of the same links. */
export function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-2 md:hidden">
      {navSections
        .flatMap((s) => s.items)
        .filter((item) => !item.soon)
        .map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5",
              isActive(item.href) ? "bg-hover font-medium text-fg" : "text-muted",
            )}
          >
            <item.icon className="size-4" strokeWidth={1.75} />
            {item.label}
          </Link>
        ))}
    </nav>
  );
}
