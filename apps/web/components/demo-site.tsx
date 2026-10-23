import Link from "next/link";

const accent = "#0e4d64";

export function DemoSiteHeader({ agencyId, agencyName }: { agencyId: string; agencyName: string }) {
  return (
    <header className="border-b border-black/10">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-8 px-4">
        <Link href={`/demo-site/${agencyId}`} className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded text-[15px] font-bold text-white" style={{ background: accent }}>
            {agencyName.slice(0, 1).toUpperCase()}
          </span>
          <span className="font-serif text-[19px] font-semibold tracking-tight">{agencyName}</span>
        </Link>
        <nav className="hidden flex-1 gap-6 text-[14px] text-black/70 md:flex">
          <Link href={`/demo-site/${agencyId}`} className="font-medium text-black">
            Kopen
          </Link>
          <span>Huren</span>
          <span>Verkopen</span>
          <span>Over ons</span>
          <span>Contact</span>
        </nav>
        <span className="ml-auto rounded-full border border-black/15 px-3 py-1 text-[13px]">NL · FR · EN</span>
      </div>
    </header>
  );
}

export function DemoSiteFooter({ agencyName }: { agencyName: string }) {
  return (
    <footer className="mt-16 border-t border-black/10 py-8 text-center text-[13px] text-black/50">
      © {agencyName} · Erkend vastgoedmakelaar BIV · Antwerpen · Gent
    </footer>
  );
}

export const demoAccent = accent;
