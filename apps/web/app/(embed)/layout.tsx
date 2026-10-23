export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div data-embed-root className="bg-panel p-4">{children}</div>;
}
