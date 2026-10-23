import { db, sql } from "@viewing/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, region: process.env.VERCEL_REGION ?? "local", database: "connected" });
  } catch {
    return Response.json({ ok: false, region: process.env.VERCEL_REGION ?? "local", database: "unreachable" }, { status: 503 });
  }
}
