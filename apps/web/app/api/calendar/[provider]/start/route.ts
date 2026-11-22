import { authorizeUrl, oauthConfigured, runTool, tools } from "@viewing/core";
import { cookies } from "next/headers";
import { getSession, getToolContext } from "@/lib/context";
import { createState, redirectUri, stateCookie } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

/** "Connect Google / Outlook" on an agent's page, or the office mailbox in Settings (?office=1), starts here. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") return new Response("Unknown provider", { status: 404 });
  if (!oauthConfigured(provider)) return new Response("This provider is not configured yet", { status: 503 });
  const params_ = new URL(request.url).searchParams;
  const ctx = await getToolContext();
  // The agency's office mailbox (info@), from Settings → Portal leads: admins only.
  const office = params_.get("office") === "1";
  let loginHint: string | undefined;
  if (office) {
    if (!(await getSession()).isAdmin) return new Response("Only admins can connect the office mailbox", { status: 403 });
  } else {
    const availability = await runTool(tools.getAgentAvailability, ctx, { agentId: params_.get("agentId") ?? "" }).catch(() => null);
    if (!availability) return new Response("Agent not found", { status: 404 });
    loginHint = availability.agent.email ?? undefined;
  }

  const { state, nonce } = createState({ agencyId: ctx.agencyId, agentId: office ? null : params_.get("agentId"), provider });
  (await cookies()).set(stateCookie, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/calendar" });
  return Response.redirect(authorizeUrl(provider, { redirectUri: redirectUri(request, provider), state, loginHint }), 302);
}
