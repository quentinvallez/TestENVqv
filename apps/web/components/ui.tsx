import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "ai"; size?: "sm" | "md" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
        variant === "primary" && "bg-primary text-primary-fg hover:opacity-90",
        variant === "secondary" && "border border-line bg-panel text-fg hover:bg-hover",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-fg",
        variant === "ai" && "border border-ai-line bg-ai-soft text-ai hover:brightness-95",
        className,
      )}
      {...props}
    />
  );
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-panel", className)} {...props} />;
}

export function PageHeader({
  crumbs,
  actions,
}: {
  crumbs: { label: string; href?: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line px-5">
      <nav className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-faint" />}
            {crumb.href ? (
              <Link href={crumb.href} className="truncate text-muted hover:text-fg">
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate font-medium">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-2">{actions}</div>
    </header>
  );
}

export function Tabs({ tabs, active }: { tabs: { id: string; label: string; href: string; icon?: React.ReactNode; ai?: boolean }[]; active: string }) {
  return (
    <div className="flex h-10 shrink-0 items-end gap-5 overflow-x-auto border-b border-line px-5">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-[13px] whitespace-nowrap transition-colors",
            tab.id === active ? "border-fg font-medium text-fg" : "border-transparent text-muted hover:text-fg",
            tab.ai && tab.id !== active && "text-ai",
          )}
        >
          {tab.icon}
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export function StatusDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export function Avatar({ name, color, size = 20 }: { name: string; color?: string | null; size?: number }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: color ?? "#71717a" }}
    >
      {initials}
    </span>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded border border-line px-1.5 text-[11px] font-medium text-muted", className)}>
      {children}
    </span>
  );
}

export function AiPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded border border-ai-line bg-ai-soft px-1.5 text-[11px] font-medium text-ai">
      <Sparkles className="size-3" />
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-line bg-panel text-muted">{icon}</div>
      <h3 className="text-[14px] font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Panel className="px-4 py-3.5">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[12px] text-faint">{hint}</div>}
    </Panel>
  );
}
