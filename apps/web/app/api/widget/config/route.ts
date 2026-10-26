import { widgetConfig } from "@viewing/core/public";
import { valuationText } from "@/lib/valuation-i18n";
import { toWidgetLang, widgetText } from "@/lib/widget-i18n";

export const dynamic = "force-dynamic";

// Called by widget.js on every page of an agency's website.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const agency = url.searchParams.get("agency");
  if (!agency) return Response.json({ error: "agency is required" }, { status: 400, headers: cors });
  const config = await widgetConfig(agency);
  if (!config) return Response.json({ error: "unknown agency" }, { status: 404, headers: cors });
  const lang = toWidgetLang(url.searchParams.get("lang") ?? undefined);
  const text = valuationText[lang];
  return Response.json(
    { ...config, text: { launcher: text.launcher, title: text.title, close: text.close, booking: widgetText[lang].title } },
    { headers: { ...cors, "Cache-Control": "public, max-age=60" } },
  );
}
