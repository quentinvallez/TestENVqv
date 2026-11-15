import { embedFontFaces, embedLook, embedRootCss } from "@/lib/embed-look";

/**
 * Wraps a widget shown inside an agency's website: their colours and font
 * (read from their page by widget.js), a larger size, and a transparent page so
 * the site's own background shows through.
 */
export function EmbedFrame({ query, savedBrand, children }: { query: Record<string, string | undefined>; savedBrand?: string | null; children: React.ReactNode }) {
  const style = embedLook(query, savedBrand);
  return (
    <>
      {/* The iframe is transparent only when its page is, and its color-scheme matches the site's. */}
      <style>{`html,body{background:transparent!important}${embedRootCss(query)}${embedFontFaces(query)}`}</style>
      <div data-embed-look className="embed-large p-4 text-fg sm:p-5" style={style}>
        {children}
      </div>
    </>
  );
}
