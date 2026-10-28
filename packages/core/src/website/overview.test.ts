import { describe, expect, it } from "vitest";
import { followingPage } from "./discover";
import { cardStatuses, firstPage, repeatedCards, formPage, guessedPages, listingLinks, nextPageLinks, pageNumber, statedTotal, urlShape } from "./overview";

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

  it("recognises cards without an id in their address by how the page shows them", () => {
    const card = (slug: string, price: string) =>
      `<div class="col"><article class="bien"><a href="/${slug}"><img src="/p/${slug}.jpg"></a><h3><a href="/${slug}">${slug}</a></h3><p>${price}</p><p>120 m²</p></article></div>`;
    const html = `<header><nav><a href="/biens">Biens</a><a href="/a-vendre">À vendre</a><a href="/contact">Contact</a></nav></header>
      <main><ul class="filters"><li><a href="/biens?ville=arlon">Arlon</a></li><li><a href="/biens?ville=virton">Virton</a></li><li><a href="/biens?ville=habay">Habay</a></li></ul>
      <div class="grid">${card("arlon-app-004-rue-du-camp", "285.000 €")}${card("avendre-maison-habay", "€ 349.000")}${card("virton-terrain-a-batir", "Prix sur demande")}${card("louer-studio-arlon", "650 €/mois")}</div>
      <div class="news"><a href="/actu-1">Actu</a><a href="/actu-2">Actu</a><a href="/actu-3">Actu</a></div></main>`;
    const expected = ["arlon-app-004-rue-du-camp", "avendre-maison-habay", "louer-studio-arlon", "virton-terrain-a-batir"].map((s) => `${site}/${s}`);
    expect(repeatedCards(html, `${site}/biens`, site).sort()).toEqual(expected);
    expect(listingLinks(html, `${site}/biens`, site).sort()).toEqual(expected);
  });

  it("recognises a page builder's cards, whose elements each carry their own class, and the status in their photo's name", () => {
    let n = 0;
    const card = (slug: string, photo: string) => {
      n++;
      return `<section class="Le88gL comp-a${n}x wixui-section"><div class="Ak0vpt"><div class="comp-b${n}y FDI5TK"><p class="font_3">Maison 3 chambres</p><h2>195.000 &euro;</h2>
        <div class="comp-c${n}z"><a href="https://www.tadam.immo/${slug}" class="StylableButton">+ d'infos</a></div>
        <div class="W4V2qg comp-d${n}w wixui-image"><a href="https://www.tadam.immo/${slug}" class="apPOZK"><img src="x.jpg" alt="${photo}"></a></div></div></div></section>`;
    };
    const html = `<header><nav><a href="https://www.tadam.immo/biens">Biens</a></nav></header><main>${card("arlon-app-004-rue-du-camp", "TADAM immobiliere_a vendre_Arlon_9,rue du Camp - 5.jpg")}${card("bonnert-29-rue-du-vicinal", "TADAM immobiliere_a vendre_Bonnert_29, rue du Vicinal - Sous offre.jpg")}${card("waltzing-15-rue-de-steinchen", "2679_TADAM_Waltzing_Maison_15,rue de Steinchen_Sous compromis.jpg")}${card("arlon-53-ruedesmartyrs", "TADAM_Arlon_53_VENDU.jpg")}</main>`;
    const cards = listingLinks(html, "https://www.tadam.immo/biens", "https://www.tadam.immo");
    expect(cards).toHaveLength(4);
    expect([...cardStatuses(html, "https://www.tadam.immo/biens", cards).values()]).toEqual(["under_offer", "under_offer", "sold"]);
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

  it("doesn't take a project's share of sold units for a badge", () => {
    const card = (id: number, badge: string) =>
      `<div class="card"><a href="/nieuwbouw/tielt/${id}/project"><img src="/p/${id}.jpg" alt="Project"></a><span class="label">${badge}</span><p>Vanaf € 195 000</p></div>`;
    const html = `<div class="grid">${card(11090085, "81% verkocht")}${card(11091807, "Reeds 50% verkocht")}${card(11091808, "Verkocht")}</div>`;
    const cards = [11090085, 11091807, 11091808].map((id) => `${site}/nieuwbouw/tielt/${id}/project`);
    expect(Object.fromEntries(cardStatuses(html, `${site}/nieuwbouw`, cards))).toEqual({ [cards[2]!]: "sold" });
  });

  it("doesn't take a sort menu above the first card for its badge", () => {
    const html = `<div class="list"><div class="bar"><select name="sort"><option>Nieuwste</option><option>Verkocht</option></select></div>
      <div class="card"><a href="/aanbod/4295691/grond-te-koop-in-3600-genk">Grond te koop</a></div>
      <div class="card"><a href="/aanbod/4295692/huis-te-koop-in-3600-genk">Huis te koop</a><span>Verkocht</span></div></div>`;
    const statuses = cardStatuses(html, `${site}/aanbod`, [`${site}/aanbod/4295691/grond-te-koop-in-3600-genk`, `${site}/aanbod/4295692/huis-te-koop-in-3600-genk`]);
    expect([...statuses]).toEqual([[`${site}/aanbod/4295692/huis-te-koop-in-3600-genk`, "sold"]]);
  });

  it("doesn't take a sort list of links above the first card for its badge", () => {
    const card = (id: number, label = "") => `<div class="estate"><a href="/aanbod/${id}/huis-te-koop">Huis te koop</a><p>Genk</p>${label}</div>`;
    const html = `<section><div class="sort"><a href="#">Recent oplopend</a><a href="#">Verhuurd</a></div>${card(4406798)}${card(4406799)}${card(4406800, '<span class="lbl">Verkocht</span>')}</section>`;
    const urls = [4406798, 4406799, 4406800].map((id) => `${site}/aanbod/${id}/huis-te-koop`);
    expect([...cardStatuses(html, `${site}/te-huur`, urls)]).toEqual([[urls[2], "sold"]]);
  });

  it("doesn't take a word in a card's description for its badge", () => {
    const html = `<div class="card"><a href="/aanbod/4295691/grond-te-koop-in-3600-genk">Grond te koop</a><p>Beschikbare loten: Lot 1: 4a 97ca – halfopen bebouwing: VERKOCHT ! Lot 3: 5a 63ca – open bebouwing</p></div>
      <div class="card"><a href="/aanbod/4295692/huis-te-koop-in-3600-genk">Huis te koop</a><span class="badge">Verkocht</span></div>`;
    const statuses = cardStatuses(html, `${site}/aanbod`, [`${site}/aanbod/4295691/grond-te-koop-in-3600-genk`, `${site}/aanbod/4295692/huis-te-koop-in-3600-genk`]);
    expect([...statuses]).toEqual([[`${site}/aanbod/4295692/huis-te-koop-in-3600-genk`, "sold"]]);
  });

  it("doesn't take the page's menu for the card when a page shows one card", () => {
    const html = `<body><nav><a href="/verkocht">Verkocht</a></nav><main><div><a href="/te-koop/gent/woning/97001">Woning</a></div></main></body>`;
    expect(cardStatuses(html, `${site}/kopen`, [`${site}/te-koop/gent/woning/97001`]).size).toBe(0);
  });
});
