import type { Branding } from "@viewing/db/schema";

/** Card frame for client-facing pages, in the agency's colours when known. */
export function BookingShell({ agencyName, branding, children }: { agencyName: string; branding?: Branding | null; children: React.ReactNode }) {
  const brand = branding?.primaryColor;
  return (
    <div
      className="mx-auto w-full max-w-[520px]"
      style={{ "--brand": brand ?? "var(--primary)", "--brand-fg": brand ? "#ffffff" : "var(--primary-fg)" } as React.CSSProperties}
    >
      <div className="mb-5 flex items-center gap-2">
        {branding?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={agencyName} className="h-7 w-auto" />
        ) : (
          <>
            <span className="flex size-7 items-center justify-center rounded-md bg-[var(--brand)] text-[13px] font-semibold text-[var(--brand-fg)]">
              {agencyName.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-[15px] font-semibold tracking-tight">{agencyName}</span>
          </>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-panel">{children}</div>
      <p className="mt-4 text-center text-[11px] text-faint">Your details are only shared with {agencyName}.</p>
    </div>
  );
}
