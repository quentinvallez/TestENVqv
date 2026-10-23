// Temporary setup check: confirms Vercel runs in Frankfurt and can reach the Neon database.
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const result = { vercelRegion: process.env.VERCEL_REGION ?? null, databaseConfigured: Boolean(url) };

  if (url) {
    result.databaseHost = new URL(url).hostname.replace(/^[^.]+/, "***");
    try {
      const sql = neon(url);
      const [row] = await sql`select version() as version, now() as now`;
      result.databaseConnected = true;
      result.postgres = row.version.split(" ").slice(0, 2).join(" ");
    } catch (err) {
      result.databaseConnected = false;
      result.error = err.message;
    }
  }

  res.status(200).json(result);
}
