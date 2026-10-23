export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-canvas px-4 py-8 sm:py-14">{children}</div>;
}
