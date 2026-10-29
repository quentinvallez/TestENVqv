import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { sameSite } from "./extract";

/*
 * Fetching pages of an agency's website. Only public http(s) hosts on the
 * agency's own site are read: the URL comes from the agency's settings or from
 * a page visit reported by widget.js, so it must never reach our own network.
 */

export const USER_AGENT = "ViewingBot/1.0 (+https://testenvqv.vercel.app; reads listings for the agency that installed our widget)";
const MAX_BYTES = 3 * 1024 * 1024;

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

function privateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a === "::1" || a === "::" || a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd")) return true;
    const mapped = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? privateAddress(mapped[1]!) : false;
  }
  const [a, b] = address.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Throws unless the URL is an https/http page on a public host. */
export async function assertPublicUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchError("Only web pages can be read");
  if (url.port && url.port !== "80" && url.port !== "443") throw new FetchError("Only standard web ports are allowed");
  if (url.username || url.password) throw new FetchError("Addresses with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) throw new FetchError("This address is not a public website");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new FetchError(`${host} could not be found`);
  if (addresses.some((a) => privateAddress(a.address))) throw new FetchError("This address is not a public website");
}

export type FetchedPage = { url: string; status: number; html: string };

/**
 * GET a page of the agency's site. Redirects are followed by hand (at most
 * five) and must stay on the same site, on paths its robots.txt allows.
 */
export async function fetchSitePage(
  input: string,
  site: string,
  allowed: (url: string) => boolean = () => true,
  timeoutMs = 12_000,
  headers: Record<string, string> = {},
  cookies?: Map<string, string>,
): Promise<FetchedPage> {
  let url = new URL(input);
  for (let hop = 0; hop < 6; hop++) {
    if (!sameSite(url, site)) throw new FetchError(`${url.hostname} is not on the agency's website`);
    if (!allowed(url.toString())) throw new FetchError("Redirected to a page the website's robots.txt doesn't allow");
    await assertPublicUrl(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
        "accept-language": "nl-BE,nl;q=0.9,fr-BE;q=0.8,en;q=0.6",
        ...(cookies?.size ? { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
        ...headers,
        "user-agent": USER_AGENT,
      },
    });
    // Some sites tie a listing's address to the visit that found it (a session cookie), as a browser keeps it.
    if (cookies) {
      for (const line of response.headers.getSetCookie()) {
        const [, name, value] = line.match(/^\s*([^=;\s]+)=([^;]*)/) ?? [];
        if (name) cookies.set(name, value ?? "");
      }
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = new URL(response.headers.get("location")!, url);
      await response.body?.cancel();
      continue;
    }
    const type = response.headers.get("content-type") ?? "";
    if (response.ok && !/html|xml|json|text\/plain/i.test(type)) {
      await response.body?.cancel();
      throw new FetchError(`Not a web page (${type || "unknown type"})`, response.status);
    }
    const html = await readCapped(response);
    return { url: url.toString(), status: response.status, html };
  }
  throw new FetchError("Too many redirects");
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
