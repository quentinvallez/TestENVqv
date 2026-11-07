import { needsAdminConsent, runTool, tools } from "@viewing/core";
import { cookies } from "next/headers";
import { getToolContext } from "@/lib/context";
import { readState, redirectUri, stateCookie } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  // A Microsoft 365 admin approving the app for their company (link from the agent page). They may have no account here.
  if (url.searchParams.get("state") === "admin_consent") {
    const ok = url.searchParams.get("admin_consent")?.toLowerCase() === "true";
    return new Response(
      ok
        ? "Approved. Everyone in your organisation can now connect Outlook to the planner. You can close this page."
        : "The approval did not go through. Sign in with a Microsoft 365 administrator account and try the link again.",
      { status: ok ? 200 : 400, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  const jar = await cookies();
  const state = readState(url.searchParams.get("state"), jar.get(stateCookie)?.value);
  jar.delete({ name: stateCookie, path: "/api/calendar" });
  const ctx = await getToolContext();
  if (!state || state.provider !== provider || state.agencyId !== ctx.agencyId) return new Response("This connection link expired; please try again.", { status: 400 });

  const back = new URL(`/agents/${state.agentId}`, url.origin);
  const code = url.searchParams.get("code");
  if (!code) {
    const error = url.searchParams.get("error");
    back.searchParams.set("connect", needsAdminConsent(error, url.searchParams.get("error_description")) ? "admin" : error === "access_denied" ? "denied" : "failed");
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
