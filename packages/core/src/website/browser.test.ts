import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openBrowser } from "./browser";
import { listingLinks } from "./overview";
import type { SiteReader } from "./reader";
import { allowAll } from "./robots";

// The test site runs on this machine, which the browser otherwise refuses as a private address.
vi.mock("./fetch", async (original) => ({ ...(await original<typeof import("./fetch")>()), assertPublicUrl: async () => undefined }));

/** An overview that shows 10 cards and adds 10 more each time the visitor scrolls to the bottom, or presses "Meer laden". */
const overview = (withButton: boolean) => `<!doctype html><html><body><h2>30 resultaten</h2><div id="list"></div>
${withButton ? `<button id="more">Meer laden</button>` : ""}<div style="height:3000px"></div>
<script>
  let shown = 0;
  function more() {
    if (shown >= 30) return;
    const list = document.getElementById("list");
    for (let i = shown + 1; i <= shown + 10; i++) list.insertAdjacentHTML("beforeend", '<a href="/te-koop/gent/woning-' + i + '/' + (90000 + i) + '">Woning ' + i + '</a>');
    shown += 10;
  }
  more();
  ${withButton ? `document.getElementById("more").addEventListener("click", () => setTimeout(more, 100));` : `addEventListener("scroll", () => { if (innerHeight + scrollY >= document.body.scrollHeight - 50) setTimeout(more, 100); });`}
</script></body></html>`;

describe.skipIf(!process.env.CHROMIUM_PATH)("reading an overview with a browser", () => {
  let server: Server;
  let site: string;
  beforeAll(async () => {
    server = createServer((req, res) => {
      res.setHeader("content-type", "text/html");
      res.end(overview(req.url === "/button"));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("scrolls and presses 'more' until every listing has appeared", { timeout: 60_000 }, async () => {
    const reader = { site, robots: allowAll, turn: async () => undefined } as unknown as SiteReader;
    const browser = (await openBrowser(reader))!;
    try {
      for (const path of ["/scroll", "/button"]) {
        const html = await browser.render(`${site}${path}`, Date.now() + 30_000);
        expect(html).toBeTruthy();
        expect(listingLinks(html!, `${site}${path}`, site)).toHaveLength(30);
      }
    } finally {
      await browser.close();
    }
  });
});
