/**
 * The placeholder an agency puts on its site, plus widget.js. Rendered as raw
 * HTML so React leaves whatever widget.js inserts alone, like on a real site.
 */
export function WidgetSlot({ attributes, agencyId }: { attributes: Record<string, string>; agencyId: string }) {
  const attrs = Object.entries(attributes)
    .map(([k, v]) => (v ? `${k}="${v.replace(/"/g, "&quot;")}"` : k))
    .join(" ");
  return (
    <>
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `<div ${attrs}></div>` }} />
      <script src="/widget.js" data-agency={agencyId} data-lang="nl" async />
    </>
  );
}
