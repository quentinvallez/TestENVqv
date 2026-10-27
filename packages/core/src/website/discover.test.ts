import { describe, expect, it } from "vitest";
import { continueDiscovery, newDiscovery, type DiscoveryHooks, type DiscoveryReader } from "./discover";
import { allowAll } from "./robots";

const site = "https://www.immo-test.be";

/** A site in memory; `budget` pages can be read before the run's time is up. */
function fakeSite(pages: Record<string, string>, budget = Infinity) {
  const read: string[] = [];
  const reader: DiscoveryReader = {
    site,
    robots: allowAll,
    fits: () => read.length < budget,
    read: async (url) => {
      read.push(url);
      const html = pages[url.replace(site, "") || "/"];
      return html == null ? { url, status: 404, html: "" } : { url, status: 200, html };
    },
  };
  const found = new Map<string, Set<string>>();
  const hooks: DiscoveryHooks = {
    found: async (urls, root) => {
      const tag = root ?? "*";
      let newToOverview = 0;
      let newToSite = 0;
      for (const url of urls) {
        const tags = found.get(url) ?? new Set();
        if (!tags.size) newToSite++;
        if (!tags.has(tag)) newToOverview++;
        tags.add(tag);
        found.set(url, tags);
      }
      return { newToOverview, newToSite };
    },
  };
  return { reader, hooks, read, found };
}

const cards = (from: number, to: number, path = "/te-koop/gent/woning") =>
  Array.from({ length: to - from + 1 }, (_, i) => `<a href="${path}-${from + i}/${90000 + from + i}">Bekijk</a>`).join("");

describe("searching a site for its listing pages", () => {
  it("goes through every page of an overview by its page links and records what it states", async () => {
    const { reader, hooks, found } = fakeSite({
      "/": `<a href="/kopen">Te koop</a>`,
      "/kopen": `<h2>30 resultaten</h2>${cards(1, 10)}<a href="/kopen?page=2">2</a><a href="/kopen?page=3">3</a>`,
      "/kopen?page=2": `<h2>30 resultaten</h2>${cards(11, 20)}<a href="/kopen?page=3">3</a>`,
      "/kopen?page=3": `<h2>30 resultaten</h2>${cards(21, 30)}`,
    });
    const state = newDiscovery(site);
    await continueDiscovery(reader, state, hooks, Date.now() + 60_000);
    expect(found.size).toBe(30);
    expect(state.overviews).toEqual([{ url: `${site}/kopen`, stated: 30, found: 30, pages: 3, via: "links", complete: true }]);
    expect(state.discovery.doneAt).toBeTruthy();
  });

  it("tries the usual page addresses when an overview shows fewer listings than it says and no way to the next page", async () => {
    const { reader, hooks, found, read } = fakeSite({
      "/": `<a href="/huren">Te huur</a>`,
      "/huren": `<p>12 resultaten</p>${cards(1, 6, "/te-huur/gent/app")}`,
      "/huren?page=2": `<p>12 resultaten</p>${cards(7, 12, "/te-huur/gent/app")}`,
      "/huren?page=3": `<p>12 resultaten</p>${cards(1, 6, "/te-huur/gent/app")}`,
    });
    const state = newDiscovery(site);
    await continueDiscovery(reader, state, hooks, Date.now() + 60_000);
    expect(found.size).toBe(12);
    expect(state.overviews[0]).toMatchObject({ stated: 12, found: 12, via: "guess", complete: true });
    // The other guesses for page 2 were dropped once one worked.
    expect(read).not.toContain(`${site}/huren?pagina=2`);
  });

  it("pages through the site's own search form", async () => {
    const form = (page: number) => `<form id="searchEstatePage" action="${site}/fr/acheter" method="GET"><input type="hidden" value="0" name="purpose"><input type="hidden" name="pagenumber" value="${page}"></form>`;
    const { reader, hooks, found } = fakeSite({
      "/": `<a href="/fr/acheter">Acheter</a>`,
      "/fr/acheter": `${cards(1, 14, "/fr/bien/maison")}${form(1)}`,
      "/fr/acheter?purpose=0&pagenumber=2": `${cards(15, 28, "/fr/bien/maison")}${form(2)}`,
      "/fr/acheter?purpose=0&pagenumber=3": `${cards(29, 30, "/fr/bien/maison")}${form(3)}`,
    });
    const state = newDiscovery(site);
    await continueDiscovery(reader, state, hooks, Date.now() + 60_000);
    expect(found.size).toBe(30);
    expect(state.overviews[0]).toMatchObject({ found: 30, pages: 3, via: "form", stated: null, complete: true });
  });

  it("skips the filtered slices of an overview it has whole, and reads the sitemaps last", async () => {
    const { reader, hooks, read, found } = fakeSite({
      "/": `<a href="/kopen">Te koop</a>`,
      "/kopen": `<h2>3 resultaten</h2>${cards(1, 3)}<a href="/kopen/aalst/huis">Huizen in Aalst</a><a href="/nieuwbouw">Nieuwbouw</a>`,
      "/nieuwbouw": `${cards(4, 4, "/nieuwbouw/project")}`,
      "/sitemap.xml": `<urlset><url><loc>${site}/te-koop/gent/oud-pand/80001</loc></url></urlset>`,
    });
    const state = newDiscovery(site);
    await continueDiscovery(reader, state, hooks, Date.now() + 60_000);
    expect(read).not.toContain(`${site}/kopen/aalst/huis`);
    expect(read).toContain(`${site}/nieuwbouw`);
    expect(read.indexOf(`${site}/sitemap.xml`)).toBeGreaterThan(read.indexOf(`${site}/nieuwbouw`));
    expect(found.size).toBe(5);
  });

  it("continues in the next run where the last one stopped", async () => {
    const pages = {
      "/": `<a href="/kopen">Te koop</a>`,
      "/kopen": `<h2>30 resultaten</h2>${cards(1, 10)}<a href="/kopen?page=2">2</a>`,
      "/kopen?page=2": `${cards(11, 20)}<a href="/kopen?page=3">3</a>`,
      "/kopen?page=3": `${cards(21, 30)}`,
    };
    const first = fakeSite(pages, 2);
    const state = newDiscovery(site);
    await continueDiscovery(first.reader, state, first.hooks, Date.now() + 60_000);
    expect(state.discovery.doneAt).toBeUndefined();
    expect(state.overviews[0]).toMatchObject({ found: 10, complete: false });

    // The state is saved as JSON between runs.
    const saved = JSON.parse(JSON.stringify(state));
    const second = fakeSite(pages);
    second.found.clear();
    for (const [url, tags] of first.found) second.found.set(url, tags);
    await continueDiscovery(second.reader, saved, second.hooks, Date.now() + 60_000);
    expect(second.read).not.toContain(`${site}/kopen`);
    expect(saved.overviews[0]).toMatchObject({ stated: 30, found: 30, complete: true });
    expect(saved.discovery.doneAt).toBeTruthy();
  });

  it("reads an overview with a browser when it holds fewer listings than it says", async () => {
    const { reader, hooks, found } = fakeSite({
      "/": `<a href="/kopen">Te koop</a>`,
      "/kopen": `<h2>20 resultaten</h2>${cards(1, 10)}`,
    });
    const state = newDiscovery(site);
    const rendered: string[] = [];
    await continueDiscovery(reader, state, hooks, Date.now() + 60_000, async (url) => {
      rendered.push(url);
      return cards(1, 20);
    });
    expect(rendered).toEqual([`${site}/kopen`]);
    expect(found.size).toBe(20);
    expect(state.overviews[0]).toMatchObject({ stated: 20, found: 20, via: "browser" });
  });
});
