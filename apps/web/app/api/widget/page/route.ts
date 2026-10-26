import { after } from "next/server";
import { runTool, tools } from "@viewing/core";
import { systemContext, widgetPage } from "@viewing/core/public";

export const dynamic = "force-dynamic";

// Called by widget.js with the address of the page it runs on. A listing page we
// already know gets the booking widget without any placeholder; one we don't
// know yet is read in the background, so it has the widget on the next visit.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const agency = params.get("agency");
  const url = params.get("url");
  if (!agency || !url) return Response.json({ error: "agency and url are required" }, { status: 400, headers: cors });
  const page = await widgetPage(agency, url);
  if (page.unknown) {
    after(async () => {
      try {
        await runTool(tools.importWebsitePage, systemContext(agency), { url });
      } catch (error) {
        console.error("Reading a website page failed", error);
      }
    });
  }
  return Response.json({ listingId: page.listingId, agents: page.agents }, { headers: { ...cors, "Cache-Control": "public, max-age=60" } });
}
