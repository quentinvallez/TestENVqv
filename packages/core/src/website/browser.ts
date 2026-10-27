import type { Browser } from "playwright-core";
import type { Renderer } from "./discover";
import { sameSite } from "./extract";
import { assertPublicUrl, USER_AGENT } from "./fetch";
import type { SiteReader } from "./reader";

/*
 * A browser for overview pages that only show the rest of their listings
 * while you scroll or click "more": it opens the page as a visitor would,
 * scrolls and presses "more" until nothing new appears, and gives the HTML
 * with every listing link it saw. It runs on the server (Chromium built for
 * serverless functions on Vercel, or a local Chromium in development) and only
 * when the plain read of an overview finds fewer listings than it states.
 * Images, fonts and media aren't loaded; requests to private addresses are
 * refused; pages of the agency's site follow its robots.txt.
 */

/** Longest time for one overview, whatever the run has left. */
const RENDER_MS = 90_000;
/** Stop after this many scroll or "more" rounds that add no link. */
const IDLE_ROUNDS = 3;
const MORE =
  /^\s*(toon meer|meer tonen|meer laden|laad meer|bekijk meer|meer panden|meer resultaten|load more|show more|see more|view more|voir plus|afficher plus|charger plus|plus de biens|plus de résultats|volgende|suivant|next)\b/i;

async function launch(): Promise<Browser | null> {
  if (process.env.WEBSITE_BROWSER === "off") return null;
  const { chromium } = await import("playwright-core");
  // On Vercel (and AWS Lambda) the packaged Chromium; elsewhere one installed on the machine.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const serverless = (await import("@sparticuz/chromium")).default;
    return chromium.launch({ args: serverless.args, executablePath: await serverless.executablePath(), headless: true });
  }
  const executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) return null;
  return chromium.launch({ executablePath, headless: true });
}

/** A browser for this run, started on first use; null when none can run here. Close it at the end of the run. */
export async function openBrowser(reader: SiteReader): Promise<{ render: Renderer; close: () => Promise<void> } | null> {
  let started: Promise<Browser | null> | null = null;
  const hosts = new Map<string, Promise<boolean>>();
  const publicHost = (url: URL) => {
    if (!hosts.has(url.host))
      hosts.set(
        url.host,
        assertPublicUrl(url).then(
          () => true,
          () => false,
        ),
      );
    return hosts.get(url.host)!;
  };

  const render: Renderer = async (url, deadline) => {
    started ??= launch().catch((error) => {
      console.error("No browser for reading websites", error);
      return null;
    });
    const browser = await started;
    if (!browser) return null;
    const context = await browser.newContext({ userAgent: USER_AGENT, locale: "nl-BE", viewport: { width: 1280, height: 1600 } });
    try {
      await context.route("**/*", async (route) => {
        const request = route.request();
        const target = new URL(request.url());
        const kind = request.resourceType();
        const ok =
          (target.protocol === "https:" || target.protocol === "http:") &&
          !["image", "media", "font"].includes(kind) &&
          // Pages of the agency's site as robots.txt allows; elsewhere only what the page needs to run.
          (sameSite(target, reader.site) ? reader.robots.allowed(target.toString()) : ["script", "xhr", "fetch", "stylesheet"].includes(kind)) &&
          (await publicHost(target));
        await (ok ? route.continue() : route.abort());
      });
      const page = await context.newPage();
      const until = Math.min(Date.now() + RENDER_MS, deadline);
      await reader.turn();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
      const seen = new Set<string>();
      const collect = async () => {
        const before = seen.size;
        for (const href of await page.$$eval("a[href]", (links) => links.map((a) => (a as HTMLAnchorElement).href))) seen.add(href);
        return seen.size > before;
      };
      await collect();
      let idle = 0;
      while (idle < IDLE_ROUNDS && Date.now() < until) {
        // The site's crawl delay applies to what scrolling and clicking ask of it too.
        await reader.turn();
        // A little up and all the way down, so "load on scroll" sees a scroll even when we were at the bottom already.
        await page.evaluate(() => window.scrollBy(0, -600)).catch(() => undefined);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => undefined);
        await page.mouse.wheel(0, 2_000).catch(() => undefined);
        const more = page.locator("button, a, [role=button]").filter({ hasText: MORE }).first();
        if (await more.isVisible().catch(() => false)) await more.click({ timeout: 2_000 }).catch(() => undefined);
        await page.waitForTimeout(800);
        await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
        idle = (await collect()) ? 0 : idle + 1;
      }
      // The page as it ends, plus every link it showed on the way (a list that replaces its cards keeps them all).
      return `${await page.content()}\n${[...seen].map((href) => `<a href="${href.replace(/"/g, "&quot;")}"></a>`).join("\n")}`;
    } catch (error) {
      console.error(`The browser could not read ${url}`, error);
      return null;
    } finally {
      await context.close().catch(() => undefined);
    }
  };

  return {
    render,
    close: async () => {
      const browser = await started;
      await browser?.close().catch(() => undefined);
    },
  };
}
