import { boilerplateLines } from "./extract";
import { fetchSitePage, type FetchedPage } from "./fetch";
import { allowAll, disallowAll, parseRobots, type RobotsPolicy } from "./robots";

/** The longest crawl delay we wait for; a site asking more is read at this pace. */
const MAX_DELAY_MS = 60_000;

/** At least this long between two requests to the same site, whatever its robots.txt says. Tests set it to 0. */
export const crawlPace = { minDelayMs: 1000 };

export const ROBOTS_BLOCKED = "Not allowed by the website's robots.txt";

export type ReadResult = FetchedPage | { error: string; blocked?: boolean };

/**
 * Reads one site the way its robots.txt asks: only paths it allows for our
 * crawler (or for all crawlers), one request at a time, with the delay it
 * sets between requests. Without a robots.txt everything is allowed; when the
 * file can't be read because the site fails, nothing is (as search engines do).
 */
export class SiteReader {
  private lastRequest = 0;
  /** The agency's own details repeated on every page (office address), left out when reading a listing. */
  private boilerplate: Set<string> | null = null;
  private constructor(
    readonly site: string,
    readonly robots: RobotsPolicy,
  ) {}

  static async open(site: string) {
    // A robots.txt that can't be read closes the site for this run, so one slow answer gets a second try.
    let robots = disallowAll;
    for (let attempt = 0; attempt < 2 && robots === disallowAll; attempt++) {
      try {
        const file = await fetchSitePage(`${new URL(site).origin}/robots.txt`, site);
        robots = file.status === 200 ? parseRobots(file.html) : file.status >= 500 ? disallowAll : allowAll;
      } catch {
        robots = disallowAll;
      }
    }
    const reader = new SiteReader(site, robots);
    reader.lastRequest = Date.now();
    return reader;
  }

  /** Read from the home page once per run, on first use. */
  async siteBoilerplate(): Promise<Set<string>> {
    if (!this.boilerplate) {
      const home = await this.read(this.site);
      this.boilerplate = "html" in home && home.status < 400 ? boilerplateLines(home.html) : new Set();
    }
    return this.boilerplate;
  }

  get delayMs() {
    return Math.max(crawlPace.minDelayMs, Math.min((this.robots.crawlDelay ?? 0) * 1000, MAX_DELAY_MS));
  }

  /** Whether one more request still fits before the deadline, counting the wait. */
  fits(deadline: number) {
    return Math.max(Date.now(), this.lastRequest + this.delayMs) < deadline;
  }

  /** Waits for this site's turn; other readers of the site (a browser) call it before each page. */
  async turn() {
    const wait = this.lastRequest + this.delayMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequest = Date.now();
  }

  async read(url: string, headers?: Record<string, string>): Promise<ReadResult> {
    if (!this.robots.allowed(url)) return { error: ROBOTS_BLOCKED, blocked: true };
    await this.turn();
    try {
      return await fetchSitePage(url, this.site, this.robots.allowed, undefined, headers);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.lastRequest = Date.now();
    }
  }
}
