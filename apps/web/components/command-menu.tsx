"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { navSections } from "./nav";

const OPEN_EVENT = "open-command-menu";
export const openCommandMenu = () => window.dispatchEvent(new Event(OPEN_EVENT));

/**
 * ⌘K: jump anywhere, and (from the planner phase on) ask the agent to do things
 * in plain language. Both run through the same tool registry.
 */
export function CommandMenu({ listings }: { listings: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[15vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <Command
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/10"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      >
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search listings, pages, or ask the agent…"
          className="h-12 w-full border-b border-line bg-transparent px-4 text-[14px] outline-none placeholder:text-faint"
        />
        <Command.List className="max-h-[360px] overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-faint">
          <Command.Empty className="px-3 py-6 text-center text-muted">No results.</Command.Empty>
          {query && (
            <Command.Group heading="Agent">
              <Command.Item
                value={`ask ${query}`}
                disabled
                className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-ai opacity-70"
              >
                <Sparkles className="size-4" />
                <span className="truncate">Ask the planner: “{query}”</span>
                <span className="ml-auto text-[11px] text-faint">Coming with the planner agent</span>
              </Command.Item>
            </Command.Group>
          )}
          <Command.Group heading="Go to">
            {navSections.flatMap((s) => s.items).map((item) => (
              <Command.Item
                key={item.href}
                value={item.label}
                onSelect={() => go(item.href)}
                className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-muted data-[selected=true]:bg-hover data-[selected=true]:text-fg"
              >
                <item.icon className="size-4" strokeWidth={1.75} />
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
          {listings.length > 0 && (
            <Command.Group heading="Listings">
              {listings.map((listing) => (
                <Command.Item
                  key={listing.id}
                  value={listing.label}
                  onSelect={() => go(`/listings/${listing.id}`)}
                  className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-muted data-[selected=true]:bg-hover data-[selected=true]:text-fg"
                >
                  <span className="truncate">{listing.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
