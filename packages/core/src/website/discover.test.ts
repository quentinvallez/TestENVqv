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

  it("reads the site in one language and skips what was sold", async () => {
    const { reader, hooks, read, found } = fakeSite({
      "/": `<a href="/nl/te-koop">Te koop</a><a href="/fr/a-vendre">À vendre</a><a href="/nl/referenties">Verkocht</a>`,
      "/nl/te-koop": `<h2>3 resultaten</h2>${cards(1, 3, "/nl/te-koop/gent/woning")}<a href="/fr/a-vendre">FR</a>`,
      "/sitemap.xml": `<urlset>${[1, 2, 3].map((i) => `<url><loc>${site}/fr/a-vendre/gand/maison-${i}/${90000 + i}</loc></url>`).join("")}</urlset>`,
    });
    const state = newDiscovery(site);
    await continueDiscovery(reader, state, hooks, Date.now() + 60_000);
    expect(state.discovery.language).toBe("nl");
    expect(read).not.toContain(`${site}/fr/a-vendre`);
    expect(read).not.toContain(`${site}/nl/referenties`);
    expect(found.size).toBe(3);
  });

  it("tries page addresses only on overviews that bring new listings, and then only the way that worked", async () => {
    const { reader, hooks, read } = fakeSite({
      "/": `<a href="/kopen">Te koop</a><a href="/kopen-huizen">Huizen</a><a href="/huren">Te huur</a><a href="/blog/nieuws">Nieuws</a>`,
      "/kopen": `${cards(1, 8)}`,
      "/kopen?pagina=2": `${cards(9, 16)}`,
      "/kopen?pagina=3": `${cards(1, 8)}`,
      "/kopen-huizen": `${cards(1, 8)}`,
      "/huren": `${cards(1, 8, "/te-huur/gent/app")}`,
      "/huren?pagina=2": `${cards(9, 10, "/te-huur/gent/app")}`,
      "/blog/nieuws": `<a href="/te-koop/gent/woning-99/99999">Ons nieuwste pand</a><a href="/kopen">Alle panden</a>`,
    });
    const state = newDiscovery(site);
    await continueDiscovery(reader, state, hooks, Date.now() + 60_000);
    expect(state.discovery.pagingKey).toBe("pagina");
    // A slice of what we have, and an article with one listing, get no tries.
    expect(read.filter((url) => url.startsWith(`${site}/kopen-huizen?`) || url.startsWith(`${site}/blog/nieuws?`))).toEqual([]);
    // The second overview tries only "?pagina=", and goes on that way.
    expect(read.filter((url) => url.startsWith(`${site}/huren?`))).toEqual([`${site}/huren?pagina=2`, `${site}/huren?pagina=3`]);
  });

  it("takes a page linked like an overview as a listing when its address follows the template of the cards", async () => {
    const { reader, hooks, found } = fakeSite({
      "/": `<a href="/te-koop">Te koop</a><a href="/te-koop/ghoy/grond/landbouwgrond/230">Landbouwgrond</a>`,
      "/te-koop": cards(1, 8, "/te-koop/gent/huis/woning"),
      "/te-koop/ghoy/grond/landbouwgrond/230": `<h1>Landbouwgrond</h1><a href="/te-koop/ogy/grond/weiland/229">Ook te koop</a>`,
      "/te-koop/ogy/grond/weiland/229": `<h1>Weiland</h1>`,
    });
    const state = newDiscovery(site);
    await continueDiscovery(reader, state, hooks, Date.now() + 60_000);
    expect(found.has(`${site}/te-koop/ghoy/grond/landbouwgrond/230`)).toBe(true);
    expect(found.size).toBe(9);
    expect(state.overviews.map((o) => o.url)).toEqual([`${site}/te-koop`]);
  });

  it("takes the listings a sitemap shows below an overview's address when the overview shows them only through scripts", async () => {
    const { reader, hooks, found } = fakeSite({
      "/": `<a href="/nl/kopen">Kopen</a><a href="/nl/huren">Huren</a>`,
      "/nl/kopen": `<div id="___gatsby"></div>`,
      "/nl/huren": `<div id="___gatsby"></div>`,
      "/sitemap.xml": `<urlset><url><loc>${site}/nl/kopen/deurne/ruim-appartement/5626/</loc></url><url><loc>${site}/nl/kopen/deurne/</loc></url>
        <url><loc>${site}/nl/huren/merksem/appartement/5623/</loc></url><url><loc>${site}/nl/contact</loc></url></urlset>`,
    });
    const state = newDiscovery(site);
    await continueDiscovery(reader, state, hooks, Date.now() + 60_000);
    expect([...found.keys()].sort()).toEqual([`${site}/nl/huren/merksem/appartement/5623`, `${site}/nl/kopen/deurne/ruim-appartement/5626`]);
    expect(state.overviews.map((o) => [o.url.replace(site, ""), o.found])).toEqual([
      ["/nl/kopen", 1],
      ["/nl/huren", 1],
    ]);
  });

  it("reads each new-build project for its units, or takes the project as one listing when it has none", async () => {
    const { reader, hooks, found } = fakeSite({
      "/": `<a href="/nieuwbouw">Nieuwbouw</a>`,
      "/nieuwbouw": `<a href="/nieuwbouw/aalst/hof-ten-berge">Hof ten Berge</a><a href="/nieuwbouw/lede/magnolia">Magnolia</a><a href="/nieuwbouw/aalst">Aalst</a>`,
      "/nieuwbouw/aalst/hof-ten-berge": `${cards(1, 3, "/nieuwbouw/aalst/hof-ten-berge/woning")}<a href="/te-koop/gent/woning-9/90009">Ook te koop</a>`,
      "/nieuwbouw/lede/magnolia": `<h1>Magnolia</h1><p>Vanaf € 350 000</p>`,
    });
    const state = newDiscovery(site);
    await continueDiscovery(reader, state, hooks, Date.now() + 60_000);
    // The units below the project's address, not what it shows next to them; the project without units is one listing.
    expect([...found.keys()].sort()).toEqual([
      ...[1, 2, 3].map((i) => `${site}/nieuwbouw/aalst/hof-ten-berge/woning-${i}/${90000 + i}`),
      `${site}/nieuwbouw/lede/magnolia`,
    ].sort());
    expect(found.get(`${site}/nieuwbouw/lede/magnolia`)).toEqual(new Set([`${site}/nieuwbouw`]));
    expect(state.overviews.find((o) => o.url === `${site}/nieuwbouw`)).toMatchObject({ found: 4, complete: true });
  });
});
