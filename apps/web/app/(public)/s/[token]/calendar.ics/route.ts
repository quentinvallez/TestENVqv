import { icsCalendar, runTool, tools } from "@viewing/core";
import { occupantAgency, publicContext } from "@viewing/core/public";

export const dynamic = "force-dynamic";

const titles = { nl: "Bezoek", fr: "Visite", en: "Viewing" } as const;
const calendarNames = { nl: "Bezoeken", fr: "Visites", en: "Viewings" } as const;

/** The viewings of the home as a calendar feed the owner or tenant subscribes to from their phone. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await occupantAgency(token);
  if (!found) return new Response("Not found", { status: 404 });
  const page = await runTool(tools.getOccupantPage, publicContext(found.agencyId), { token, markSeen: false });
  const lang = page.occupant.language;
  const body = icsCalendar(
    `${calendarNames[lang]} · ${page.listing.address || found.agencyName}`,
    page.viewings.map((v) => ({
      uid: `${v.id}@viewing`,
      start: v.startsAt,
      end: v.endsAt,
      summary: `${titles[lang]}: ${v.visitor}`,
      location: page.listing.address,
      description: v.agentName ? `${found.agencyName} · ${v.agentName}` : found.agencyName,
    })),
  );
  return new Response(body, {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300", "x-robots-tag": "noindex" },
  });
}
