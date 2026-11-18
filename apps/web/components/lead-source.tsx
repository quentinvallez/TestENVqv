import { cn } from "@/lib/cn";
import { Pill } from "./ui";

/** Where a lead came from, as the inbox shows it: one of the portals, or the agency's own website. */
export const leadOrigins = {
  immoweb: { label: "Immoweb" },
  zimmo: { label: "Zimmo" },
  immovlan: { label: "Immovlan" },
  immoscoop: { label: "Immoscoop" },
  website: { label: "Website" },
} as const;

export type LeadOrigin = keyof typeof leadOrigins;

/**
 * The portals' own small logos, served from `public/sources/`. A portal without
 * a file here shows its name only; the website never gets a logo.
 */
const logos: Partial<Record<Exclude<LeadOrigin, "website">, string>> = {};

/**
 * A lead's source as an origin: the portal it came from, or "website" for the
 * booking widget, the booking link and the valuation form on the agency's site.
 * Phone, WhatsApp and manual leads show nothing.
 */
export function leadOrigin(source: string | null | undefined): LeadOrigin | null {
  if (source === "valuation") return "website";
  return source && source in leadOrigins ? (source as LeadOrigin) : null;
}

/** Small pill naming where a lead came from, with the portal's logo. */
export function LeadSourcePill({ origin, prefix, className }: { origin: LeadOrigin; prefix?: string; className?: string }) {
  const logo = origin === "website" ? undefined : logos[origin];
  return (
    <Pill className={cn("text-fg", className)}>
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element -- a 12px static logo
        <img src={logo} alt="" width={12} height={12} className="size-3 shrink-0 rounded-[2px] object-contain" />
      )}
      {prefix && <span className="font-normal text-muted">{prefix}</span>}
      {leadOrigins[origin].label}
    </Pill>
  );
}
