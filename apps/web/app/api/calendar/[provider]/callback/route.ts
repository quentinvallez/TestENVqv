import { runTool, tools } from "@viewing/core";
import { cookies } from "next/headers";
import { getToolContext } from "@/lib/context";
import { readState, redirectUri, stateCookie } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const jar = await cookies();
  const state = readState(url.searchParams.get("state"), jar.get(stateCookie)?.value);
  jar.delete({ name: stateCookie, path: "/api/calendar" });
  const ctx = await getToolContext();
  if (!state || state.provider !== provider || state.agencyId !== ctx.agencyId) return new Response("This connection link expired; please try again.", { status: 400 });

  const back = new URL(`/agents/${state.agentId}`, url.origin);
  const code = url.searchParams.get("code");
  if (!code) {
    back.searchParams.set("connect", url.searchParams.get("error") === "access_denied" ? "denied" : "failed");
    return Response.redirect(back, 302);
  }
  try {
    await runTool(tools.connectCalendar, ctx, { agentId: state.agentId, provider: state.provider, code, redirectUri: redirectUri(request, provider) });
    back.searchParams.set("connect", "ok");
  } catch (error) {
    console.error("Calendar connection failed", error);
    back.searchParams.set("connect", "failed");
  }
  return Response.redirect(back, 302);
}
