import { runAutomationsForAllAgencies } from "@viewing/core";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Called by Vercel Cron (see vercel.json), which sends CRON_SECRET as a bearer token. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const results = await runAutomationsForAllAgencies();
  return Response.json({ ranAt: new Date().toISOString(), agencies: Object.keys(results).length, results });
}
