import type { Metadata } from "next";

export const metadata: Metadata = { title: "Widget preview", robots: { index: false, follow: false } };

/** Full screen: the agency's own site fills the page, with our widget on top. */
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh flex-col overflow-hidden bg-canvas">{children}</div>;
}
