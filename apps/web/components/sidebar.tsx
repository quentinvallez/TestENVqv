"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { navItemActive, navSections } from "./nav";
import { openCommandMenu } from "./command-menu";

export function Sidebar({ agencyName, userName, myAgentId, inboxCount }: { agencyName: string; userName: string; myAgentId: string | null; inboxCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
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
                  navItemActive(item, pathname) ? "bg-hover font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg",
                )}
              >
                <item.icon className="size-4" strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
                {item.href === "/inbox" && inboxCount > 0 && (
                  <span className="rounded bg-ai-soft px-1.5 text-[11px] font-medium text-ai tabular-nums">{inboxCount}</span>
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-1 border-t border-line pt-3 text-muted">
        <Link
          href={myAgentId ? `/agents/${myAgentId}` : "#"}
          title="My page: hours, mailbox and viewings"
          className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1", myAgentId ? "hover:bg-hover hover:text-fg" : "pointer-events-none")}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-hover text-[11px] font-medium text-fg">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate">{userName}</span>
          {myAgentId && <span className="shrink-0 text-[11px] text-faint">My page</span>}
        </Link>
        <button onClick={signOut} title="Log out" className="rounded p-1 hover:bg-hover hover:text-fg">
          <LogOut className="size-3.5" />
        </button>
      </div>
    </aside>
  );
}
