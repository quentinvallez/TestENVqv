import { runTool, tools } from "@viewing/core";
import { getToolContext } from "@/lib/context";

export const dynamic = "force-dynamic";

/** A client's data as a JSON file, to send them when they ask for a copy (GDPR access request). Logged-in users only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getToolContext();
  const data = await runTool(tools.exportContact, ctx, { contactId: id });
  const name = [data.contact.firstName, data.contact.lastName].filter(Boolean).join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "") || "client";
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
