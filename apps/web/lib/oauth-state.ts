import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * The OAuth "state" parameter: which agent is connecting, signed so it can't be
 * swapped for another agency's agent, and tied to a cookie in the browser that
 * started the flow.
 */

type State = { agencyId: string; agentId: string; provider: "google" | "microsoft"; nonce: string; exp: number };

function sign(payload: string) {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "").update(payload).digest("base64url");
}

export function createState(input: Omit<State, "nonce" | "exp">): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ ...input, nonce, exp: Date.now() + 10 * 60_000 })).toString("base64url");
  return { state: `${payload}.${sign(payload)}`, nonce };
}

export function readState(state: string | null, nonce: string | undefined): State | null {
  const [payload, signature] = (state ?? "").split(".");
  if (!payload || !signature || !nonce) return null;
  const expected = sign(payload);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as State;
  if (parsed.exp < Date.now() || parsed.nonce !== nonce) return null;
  return parsed;
}

/** Redirect URIs must match the app registration exactly, so they use APP_URL when set (see docs/setup-calendars.md). */
export function redirectUri(request: Request, provider: string) {
  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  return new URL(`/api/calendar/${provider}/callback`, origin).toString();
}

export const stateCookie = "oauth_nonce";
