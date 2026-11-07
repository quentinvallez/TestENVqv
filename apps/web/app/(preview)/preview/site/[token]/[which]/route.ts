import { previewPage } from "@viewing/core/public";

export const dynamic = "force-dynamic";

/**
 * The agency's own page (home or a listing) as we read it, shown in the preview when its site keeps itself out of
 * frames. Its styles, images and scripts load from its own site in the visitor's browser; nothing runs on our side.
 * The sandbox header gives the page no origin of ours, even when opened on its own, so its scripts can't reach our
 * cookies or pages.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; which: string }> }) {
  const { token, which } = await params;
  const html = await previewPage(token, which);
  if (!html) return new Response("Not found", { status: 404 });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-popups",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
