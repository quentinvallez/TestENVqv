import { eq, schema } from "@viewing/db";
import { decrypt, encrypt } from "../crypto";
import { recordEvent } from "../events";
import type { ToolContext } from "../tool";

/*
 * One OAuth app at Google and one at Microsoft (docs/setup-calendars.md) give
 * agents a single "Connect" button for both their calendar and their mailbox.
 * Mail is send-only: client replies come back through the agency's forwarding
 * address, so we never need to read anyone's mailbox.
 */

export type OAuthProvider = "google" | "microsoft";
type Connection = typeof schema.calendarConnections.$inferSelect;

export type Credentials = { accessToken: string; refreshToken?: string; expiresAt: number };

const config = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    scopes: {
      base: ["openid", "email"],
      calendar: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy"],
      mail: ["https://www.googleapis.com/auth/gmail.send"],
    },
  },
  microsoft: {
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientId: () => process.env.MICROSOFT_CLIENT_ID,
    clientSecret: () => process.env.MICROSOFT_CLIENT_SECRET,
    scopes: {
      base: ["openid", "email", "offline_access", "User.Read"],
      calendar: ["Calendars.ReadWrite"],
      mail: ["Mail.Send"],
    },
  },
} as const;

export function oauthConfigured(provider: OAuthProvider) {
  return Boolean(config[provider].clientId() && config[provider].clientSecret() && process.env.CALENDAR_TOKEN_KEY);
}

export function authorizeUrl(provider: OAuthProvider, options: { redirectUri: string; state: string; loginHint?: string }) {
  const c = config[provider];
  const url = new URL(c.authorize);
  const scopes = [...c.scopes.base, ...c.scopes.calendar, ...c.scopes.mail];
  url.search = new URLSearchParams({
    client_id: c.clientId() ?? "",
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state: options.state,
    ...(provider === "google" ? { access_type: "offline", prompt: "consent", include_granted_scopes: "true" } : { response_mode: "query", prompt: "select_account" }),
    ...(options.loginHint && { login_hint: options.loginHint }),
  }).toString();
  return url.toString();
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope?: string; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(provider: OAuthProvider, params: Record<string, string>): Promise<TokenResponse> {
  const c = config[provider];
  const response = await fetch(c.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId() ?? "", client_secret: c.clientSecret() ?? "", ...params }),
  });
  const body = (await response.json()) as TokenResponse;
  if (!response.ok || body.error) throw new OAuthError(body.error ?? `http_${response.status}`, body.error_description);
  return body;
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    description?: string,
  ) {
    super(description ? `${code}: ${description}` : code);
  }
}

/** The email in an ID token. It comes straight from the provider's token endpoint over TLS, so it is not re-verified. */
export function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string; preferred_username?: string };
    return (claims.email ?? claims.preferred_username ?? null)?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Which of our capabilities the granted scopes cover. */
export function grantedCapabilities(provider: OAuthProvider, scope: string | undefined): ("calendar" | "mail")[] {
  const granted = new Set((scope ?? "").split(" ").map((s) => s.toLowerCase()));
  const c = config[provider].scopes;
  // Microsoft returns scopes with the Graph prefix, e.g. https://graph.microsoft.com/Mail.Send.
  const has = (s: string) => granted.has(s.toLowerCase()) || granted.has(`https://graph.microsoft.com/${s}`.toLowerCase());
  const result: ("calendar" | "mail")[] = [];
  if (c.calendar.every(has)) result.push("calendar");
  if (c.mail.every(has)) result.push("mail");
  return result;
}

export async function exchangeCode(provider: OAuthProvider, code: string, redirectUri: string) {
  const token = await tokenRequest(provider, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const credentials: Credentials = { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 };
  let email = emailFromIdToken(token.id_token);
  if (!email && provider === "microsoft") {
    const me = (await (await fetch("https://graph.microsoft.com/v1.0/me", { headers: { authorization: `Bearer ${token.access_token}` } })).json()) as { mail?: string; userPrincipalName?: string };
    email = (me.mail ?? me.userPrincipalName ?? null)?.toLowerCase() ?? null;
  }
  return { credentials, email, capabilities: grantedCapabilities(provider, token.scope) };
}

export function sealCredentials(credentials: Credentials) {
  return encrypt(JSON.stringify(credentials));
}

/**
 * A valid access token for the connection, refreshed and saved when it is about
 * to expire. A refused refresh marks the connection expired so the agent sees
 * "Reconnect" instead of bookings silently ignoring their calendar.
 */
export async function accessToken(ctx: ToolContext, connection: Connection): Promise<string> {
  const credentials = JSON.parse(decrypt(connection.credentials)) as Credentials;
  if (credentials.expiresAt - 60_000 > Date.now()) return credentials.accessToken;
  if (!credentials.refreshToken) throw new OAuthError("no_refresh_token");
  try {
    const token = await tokenRequest(connection.provider, { grant_type: "refresh_token", refresh_token: credentials.refreshToken });
    const next: Credentials = {
      accessToken: token.access_token,
      // Microsoft rotates refresh tokens; Google keeps the old one.
      refreshToken: token.refresh_token ?? credentials.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    await ctx.db.update(schema.calendarConnections).set({ credentials: sealCredentials(next) }).where(eq(schema.calendarConnections.id, connection.id));
    return next.accessToken;
  } catch (error) {
    if (error instanceof OAuthError && (error.code === "invalid_grant" || error.code === "unauthorized_client")) {
      await ctx.db.update(schema.calendarConnections).set({ status: "expired" }).where(eq(schema.calendarConnections.id, connection.id));
      await recordEvent(
        { ...ctx, actor: { type: "system", id: null } },
        { type: "calendar.expired", subjectType: "agent", subjectId: connection.agentId, data: { provider: connection.provider, connectionId: connection.id } },
      );
    }
    throw error;
  }
}

/** fetch with the connection's bearer token; throws with the provider's message on an error status. */
export async function authorizedFetch(ctx: ToolContext, connection: Connection, url: string, init: RequestInit = {}) {
  const token = await accessToken(ctx, connection);
  const response = await fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}`, ...(init.body && { "content-type": "application/json" }) } });
  if (!response.ok) throw new Error(`${connection.provider} ${init.method ?? "GET"} ${new URL(url).pathname} failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response;
}
