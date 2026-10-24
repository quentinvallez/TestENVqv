import Link from "next/link";

/** Frame for the simulated agency website: makes clear it's a demo of the widget on someone else's site. */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-[#1d1d1f]" style={{ colorScheme: "light" }}>
      <div className="flex items-center justify-center gap-2 bg-[#171717] px-4 py-1.5 text-center text-[12px] text-white/80">
        Demo agency website · shows how the booking widget appears on an agency&apos;s own site
        <Link href="/" className="text-white underline underline-offset-2">
          Back to the app
        </Link>
      </div>
      {children}
    </div>
  );
}
