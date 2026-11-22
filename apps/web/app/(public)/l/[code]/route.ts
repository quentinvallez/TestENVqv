import { shortLinkTarget } from "@viewing/core/public";

export const dynamic = "force-dynamic";

const notFoundPage = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Link not found</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;background:#fafafa;color:#18181b}@media(prefers-color-scheme:dark){body{background:#0a0a0a;color:#fafafa}}p{margin:.25rem 1rem;text-align:center}</style></head>
<body><main><p>Deze link bestaat niet (meer).</p><p>Ce lien n'existe pas ou plus.</p><p>This link doesn't exist (any more).</p><p>Dieser Link existiert nicht (mehr).</p></main></body></html>`;

/** Short links in client emails and WhatsApp messages: `/l/<code>` → the real address. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = await shortLinkTarget(code);
  if (!target) return new Response(notFoundPage, { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer" } });
}
