import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, schema, type Database, type Transaction } from "@viewing/db";
import { shortLinkOrigin } from "../app-url";
import type { ToolContext } from "../tool";

/*
 * Every link in a message we send (booking, manage, occupant page, privacy
 * notice, WhatsApp invite, the agency's own listing page) goes out as a short
 * link on our own domain: `<SHORT_LINK_URL>/l/<code>`, redirecting to the real
 * address. No outside shortener: those hurt deliverability and trust and would
 * be one more subprocessor.
 */

export const SHORT_LINK_PATH = "/l/";
export const SHORT_CODE_LENGTH = 10;
const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A random code of 10 letters and digits (about 59 bits), so codes can't be guessed: some targets act as a key. */
export function newShortCode(): string {
  let code = "";
  while (code.length < SHORT_CODE_LENGTH) {
    for (const byte of randomBytes(16)) {
      if (byte < 248 && code.length < SHORT_CODE_LENGTH) code += base62[byte % 62];
    }
  }
  return code;
}

export const isShortCode = (code: string) => new RegExp(`^[0-9A-Za-z]{${SHORT_CODE_LENGTH}}$`).test(code);

/** Pure: the http(s) links in a text, without the punctuation that ends a sentence around them. */
export function linksIn(text: string): { url: string; index: number }[] {
  const found: { url: string; index: number }[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"`]+/gi)) {
    let url = match[0];
    for (;;) {
      const last = url.slice(-1);
      if (/[.,;:!?'\]}*]/.test(last)) url = url.slice(0, -1);
      else if (last === ")" && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) url = url.slice(0, -1);
      else break;
    }
    if (/^https?:\/\/[^/?#]+/i.test(url)) found.push({ url, index: match.index });
  }
  return found;
}

/** Pure: whether a link is worth shortening (not one of ours already, and longer than its short form). */
export function shouldShorten(url: string, origin: string): boolean {
  if (url.startsWith(`${origin}${SHORT_LINK_PATH}`)) return false;
  return url.length > origin.length + SHORT_LINK_PATH.length + SHORT_CODE_LENGTH;
}

/** Pure: the text with each link replaced by its short form, where `short` has one. */
export function replaceLinks(text: string, short: (url: string) => string | undefined): string {
  let out = "";
  let at = 0;
  for (const { url, index } of linksIn(text)) {
    const replacement = short(url);
    if (!replacement) continue;
    out += text.slice(at, index) + replacement;
    at = index + url.length;
  }
  return out + text.slice(at);
}

/** The short link for an address, reusing the one this client (or, without a client, the agency) already got. */
async function shortLinkFor(ctx: ToolContext, target: string, contactId: string | null): Promise<string> {
  const { shortLinks } = schema;
  const origin = shortLinkOrigin();
  const [existing] = await ctx.db
    .select({ code: shortLinks.code })
    .from(shortLinks)
    .where(
      and(
        eq(shortLinks.agencyId, ctx.agencyId),
        contactId ? eq(shortLinks.contactId, contactId) : isNull(shortLinks.contactId),
        eq(shortLinks.target, target),
      ),
    )
    .limit(1);
  if (existing) return `${origin}${SHORT_LINK_PATH}${existing.code}`;
  for (let attempt = 0; ; attempt++) {
    const code = newShortCode();
    const [row] = await ctx.db.insert(shortLinks).values({ code, agencyId: ctx.agencyId, contactId, target }).onConflictDoNothing().returning({ code: shortLinks.code });
    if (row) return `${origin}${SHORT_LINK_PATH}${row.code}`;
    if (attempt >= 2) return target;
  }
}

/** The text with every long link replaced by a short link on our domain. */
export async function shortenLinks(ctx: ToolContext, text: string, contactId: string | null): Promise<string> {
  const origin = shortLinkOrigin();
  const targets = [...new Set(linksIn(text).map((l) => l.url))].filter((url) => shouldShorten(url, origin));
  if (!targets.length) return text;
  const short = new Map<string, string>();
  for (const target of targets) short.set(target, await shortLinkFor(ctx, target, contactId));
  return replaceLinks(text, (url) => short.get(url));
}

/** The text with our short links written out again (tests, and support looking at a sent message). */
export async function expandShortLinks(db: Database | Transaction, text: string): Promise<string> {
  const codes = [...text.matchAll(new RegExp(`${SHORT_LINK_PATH.replace(/\//g, "\\/")}([0-9A-Za-z]{${SHORT_CODE_LENGTH}})\\b`, "g"))].map((m) => m[1]!);
  if (!codes.length) return text;
  const rows = await db.select({ code: schema.shortLinks.code, target: schema.shortLinks.target }).from(schema.shortLinks).where(inArray(schema.shortLinks.code, codes));
  const target = new Map(rows.map((r) => [r.code, r.target]));
  return replaceLinks(text, (url) => {
    const code = url.match(new RegExp(`${SHORT_LINK_PATH}([0-9A-Za-z]{${SHORT_CODE_LENGTH}})$`))?.[1];
    return code ? target.get(code) : undefined;
  });
}
