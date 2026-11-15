export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div data-embed-root>{children}</div>;
}
