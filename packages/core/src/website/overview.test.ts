import { describe, expect, it } from "vitest";
import { followingPage } from "./discover";
import { cardStatuses, firstPage, formPage, guessedPages, listingLinks, nextPageLinks, pageNumber, statedTotal, urlShape } from "./overview";

const site = "https://www.immo-test.be";

describe("the count an overview states", () => {
  it("reads the usual ways of saying it", () => {
    expect(statedTotal("<h2>265 resultaten</h2>")).toBe(265);
    expect(statedTotal("<p>Er zijn <b>80</b> panden te koop</p>")).toBe(80);
    expect(statedTotal("<div>Résultats 1 - 12 sur 1.204</div>")).toBe(1204);
    expect(statedTotal("<span>1–24 of 312 properties</span>")).toBe(312);
    expect(statedTotal("<div>704 Resultaten</div>")).toBe(704);
  });

  it("doesn't take a room count, a price or a year for it", () => {
    expect(statedTotal("<ul><li>3 slaapkamers</li><li>€ 349 000</li><li>Bouwjaar 2004</li></ul>")).toBeNull();
    expect(statedTotal("<p>Prijs € 1.250 per maand, 2 woningen in dit project aan 1.250 €</p>")).toBeNull();
  });
});

describe("the listing cards on an overview", () => {
  it("takes the links that share the listings' template, also an older listing with a short id", () => {
    const html = `
      <a href="/te-koop/aalst/charmante-woning/97188">Bekijk</a>
      <a href="/te-koop/gent/appartement-centrum/97191">Bekijk</a>
      <a href="/te-koop/ninove/oude-hoeve/4648">Bekijk</a>
      <a href="/kopen/aalst/huis">Huis te koop in Aalst</a>
      <a href="/contact">Contact</a>`;
    expect(listingLinks(html, `${site}/kopen`, site).sort()).toEqual([
      `${site}/te-koop/aalst/charmante-woning/97188`,
      `${site}/te-koop/gent/appartement-centrum/97191`,
      `${site}/te-koop/ninove/oude-hoeve/4648`,
    ]);
  });

  it("finds listing links in data attributes and the page's own data", () => {
    const html = `<div data-href="/aanbod/detail/7900001/woning"></div><script>window.items=[{"url":"\\/aanbod\\/detail\\/7900002\\/appartement"}]</script>`;
    expect(listingLinks(html, `${site}/aanbod`, site).sort()).toEqual([`${site}/aanbod/detail/7900001/woning`, `${site}/aanbod/detail/7900002/appartement`]);
  });

  it("names the template of an address", () => {
    expect(urlShape(`${site}/te-koop/aalst/charmante-woning/97188`)).toBe("te-koop/*/*/#");
    expect(urlShape(`${site}/kopen?page=2&type=huis`)).toBe("kopen?page&type");
  });
});

describe("the pages of an overview", () => {
  it("knows page numbers and offsets, and page 1 of an overview", () => {
    expect(pageNumber(`${site}/kopen?page=3`)).toEqual({ number: 3, offset: false });
    expect(pageNumber(`${site}/fr/acheter?pagenumber=2`)).toEqual({ number: 2, offset: false });
    expect(pageNumber(`${site}/kopen/page/4`)).toEqual({ number: 4, offset: false });
    expect(pageNumber(`${site}/kopen?start=24`)).toEqual({ number: 24, offset: true });
    expect(pageNumber(`${site}/kopen?pageSize=24`)).toBeNull();
    expect(firstPage(`${site}/kopen?type=huis&page=3`)).toBe(`${site}/kopen?type=huis`);
    expect(firstPage(`${site}/kopen/page/4`)).toBe(`${site}/kopen`);
  });

  it("follows rel=next and numbered page links of the same overview, in order", () => {
    const html = `<link rel="next" href="/kopen?page=2">
      <a href="/kopen?page=1">1</a><a href="/kopen?page=3">3</a><a href="/kopen?page=12">12</a><a href="/huren?page=2">huur</a>`;
    // "?page=1" may be page 2 of a site that counts from 0, so it is kept.
    expect(nextPageLinks(html, `${site}/kopen`)).toEqual([`${site}/kopen?page=1`, `${site}/kopen?page=2`, `${site}/kopen?page=3`, `${site}/kopen?page=12`]);
    expect(nextPageLinks(html.replace(/<link[^>]*>/, ""), `${site}/kopen?page=3`)).toEqual([`${site}/kopen?page=12`]);
  });

  it("pages through the site's own search form, with its chosen filters", () => {
    const html = `<form id="searchEstatePage" action="${site}/fr/acheter" method="GET">
      <input type="hidden" value="0" name="purpose"><input type="hidden" id="currentPage_p" name="pagenumber">
      <select name="estatecategory"><option value="">Tous</option><option value="2" selected>Appartements</option></select>
      <input type="checkbox" name="garden" value="1"><button type="submit">Rechercher</button></form>`;
    expect(formPage(html, `${site}/fr/acheter`, 2)).toBe(`${site}/fr/acheter?purpose=0&estatecategory=2&pagenumber=2`);
    expect(formPage(`<form action="/contact" method="get"><input name="page" value="1"></form>`, `${site}/fr/acheter`, 2)).toBeNull();
  });

  it("tries the usual page addresses and goes on the way that worked", () => {
    expect(guessedPages(`${site}/nl/te-koop`, 2, 12)).toContain(`${site}/nl/te-koop?page=2`);
    expect(guessedPages(`${site}/nl/te-koop`, 2, 12)).toContain(`${site}/nl/te-koop?start=12`);
    expect(followingPage(`${site}/nl/te-koop?page=2`, 12)).toBe(`${site}/nl/te-koop?page=3`);
    expect(followingPage(`${site}/nl/te-koop?start=12`, 12)).toBe(`${site}/nl/te-koop?start=24`);
    expect(followingPage(`${site}/nl/te-koop/page/2`, 12)).toBe(`${site}/nl/te-koop/page/3`);
  });
});

describe("the status a card shows", () => {
  it("reads the badge on each card, not its neighbour's", () => {
    const card = (id: number, badge = "") =>
      `<div class="card"><a href="/te-koop/gent/woning/${id}"><img src="/p/${id}.jpg" alt="Woning">${badge}</a><h3><a href="/te-koop/gent/woning/${id}">Woning te koop</a></h3><p>€ 349 000</p></div>`;
    const html = `<header><a href="/verkocht">Verkocht</a></header><div class="grid">${card(97001)}${card(97002, '<span class="label">Optie</span>')}${card(97003)}<div class="card"><span class="ribbon">Verkocht</span><a href="/te-koop/gent/woning/97004">Woning</a></div></div>`;
    const cards = [97001, 97002, 97003, 97004].map((id) => `${site}/te-koop/gent/woning/${id}`);
    expect(Object.fromEntries(cardStatuses(html, `${site}/kopen`, cards))).toEqual({ [cards[1]!]: "under_offer", [cards[3]!]: "sold" });
  });

  it("doesn't take the page's menu for the card when a page shows one card", () => {
    const html = `<body><nav><a href="/verkocht">Verkocht</a></nav><main><div><a href="/te-koop/gent/woning/97001">Woning</a></div></main></body>`;
    expect(cardStatuses(html, `${site}/kopen`, [`${site}/te-koop/gent/woning/97001`]).size).toBe(0);
  });
});
