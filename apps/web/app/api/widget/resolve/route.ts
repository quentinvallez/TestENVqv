import { widgetContext } from "@viewing/core/public";

export const dynamic = "force-dynamic";

// Called by widget.js from agency websites on other domains.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const agency = url.searchParams.get("agency");
  const reference = url.searchParams.get("ref");
  if (!agency || !reference) return Response.json({ error: "agency and ref are required" }, { status: 400, headers: cors });
  return Response.json(await widgetContext(agency, reference), { headers: { ...cors, "Cache-Control": "public, max-age=60" } });
}
