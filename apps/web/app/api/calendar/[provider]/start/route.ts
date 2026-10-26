import { authorizeUrl, oauthConfigured, runTool, tools } from "@viewing/core";
import { cookies } from "next/headers";
import { getToolContext } from "@/lib/context";
import { createState, redirectUri, stateCookie } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

/** "Connect Google / Outlook" on an agent's page starts here. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") return new Response("Unknown provider", { status: 404 });
  if (!oauthConfigured(provider)) return new Response("This provider is not configured yet", { status: 503 });
  const agentId = new URL(request.url).searchParams.get("agentId") ?? "";
  const ctx = await getToolContext();
  const availability = await runTool(tools.getAgentAvailability, ctx, { agentId }).catch(() => null);
  if (!availability) return new Response("Agent not found", { status: 404 });

  const { state, nonce } = createState({ agencyId: ctx.agencyId, agentId, provider });
  (await cookies()).set(stateCookie, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/calendar" });
  return Response.redirect(authorizeUrl(provider, { redirectUri: redirectUri(request, provider), state, loginHint: availability.agent.email ?? undefined }), 302);
}
