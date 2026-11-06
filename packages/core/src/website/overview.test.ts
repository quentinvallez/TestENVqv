import { describe, expect, it } from "vitest";
import { followingPage } from "./discover";
import { cardStatuses, firstPage, repeatedCards, formPage, guessedPages, listingLinks, nextPageLinks, pageNumber, statedPages, statedTotal, urlShape } from "./overview";

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
    // "?p=" naming the overview script, not a page.
    expect(firstPage(`${site}/index.php?p=listerBiens&action=V`)).toBe(`${site}/index.php?p=listerBiens&action=V`);
    expect(firstPage(`${site}/index.php?p=listerBiens&action=V&page=2`)).toBe(`${site}/index.php?p=listerBiens&action=V`);
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
    const script = guessedPages(`${site}/index.php?p=listerBiens&action=V`, 2, 6);
    expect(script).toContain(`${site}/index.php?p=listerBiens&action=V&page=2`);
    expect(script.some((url) => url.includes("p=2") || url.includes("/page/"))).toBe(false);
    expect(followingPage(`${site}/nl/te-koop?page=2`, 12)).toBe(`${site}/nl/te-koop?page=3`);
    expect(followingPage(`${site}/nl/te-koop?start=12`, 12)).toBe(`${site}/nl/te-koop?start=24`);
    expect(followingPage(`${site}/nl/te-koop/page/2`, 12)).toBe(`${site}/nl/te-koop/page/3`);
    // Domestic loads its next 24 cards from "/nl/te-koop/pagina-2" (also a page of its own).
    expect(guessedPages(`${site}/nl/te-koop`, 2, 24)).toContain(`${site}/nl/te-koop/pagina-2`);
    expect(followingPage(`${site}/nl/te-koop/pagina-2`, 24)).toBe(`${site}/nl/te-koop/pagina-3`);
    expect(firstPage(`${site}/nl/te-koop/pagina-3`)).toBe(`${site}/nl/te-koop`);
  });
});

describe("the status a card shows", () => {
  it("keeps a lone linked card apart from the rented cards drawn without a link next to it", () => {
    // Urbain Vastgoed's rentals: one card on offer with a link, eleven rented ones without.
    const rented = `<div class="card"><span class="badge">Verhuurd</span><p>Te huur</p><p>ANTWERPEN</p><p>64 m²</p></div>`;
    // As there: a bare wrapper div next to other bare divs that mention prices and areas (menus, filters).
    const html = `<body><div>Prijs tot € 1.000</div><div>Oppervlakte vanaf 50 m²</div><div><div class="list"><div class="card"><a href="/nl/huren/antwerpen/appartement/zonnig/988"><span class="badge">Nieuw</span><p>Te huur</p><p>70 m²</p><p>€ 980 / maand</p></a></div>${rented.repeat(11)}</div></div></body>`;
    const card = `${site}/nl/huren/antwerpen/appartement/zonnig/988`;
    expect(cardStatuses(html, `${site}/nl/huren`, [card]).get(card)).toBeUndefined();
    // A lone card that is rented itself still says so.
    const own = html.replace('<span class="badge">Nieuw</span>', '<span class="badge">Verhuurd</span>');
    expect(cardStatuses(own, `${site}/nl/huren`, [card]).get(card)).toBe("rented");
  });

  it("reads the badge on each card, not its neighbour's", () => {
    const card = (id: number, badge = "") =>
      `<div class="card"><a href="/te-koop/gent/woning/${id}"><img src="/p/${id}.jpg" alt="Woning">${badge}</a><h3><a href="/te-koop/gent/woning/${id}">Woning te koop</a></h3><p>€ 349 000</p></div>`;
    const html = `<header><a href="/verkocht">Verkocht</a></header><div class="grid">${card(97001)}${card(97002, '<span class="label">Optie</span>')}${card(97003)}<div class="card"><span class="ribbon">Verkocht</span><a href="/te-koop/gent/woning/97004">Woning</a></div></div>`;
    const cards = [97001, 97002, 97003, 97004].map((id) => `${site}/te-koop/gent/woning/${id}`);
    expect(Object.fromEntries(cardStatuses(html, `${site}/kopen`, cards))).toEqual({ [cards[1]!]: "under_offer", [cards[3]!]: "sold" });
  });

  it("ends a card at the next card, also when that one is drawn without a link", () => {
    const html = `<div class="row"><div class="col"><a href="/nl/aanbod/4493977/huis-te-huur-in-3600-genk"><div class="estate"><div class="lbl">Nieuw</div><span>€ 1.280</span></div></a></div><div class="col"><div href="/nl/aanbod/4346385/huis-verhuurd-in-3600-genk"><div class="estate"><div class="lbl">Verhuurd</div></div></div></div><div class="col"><div href="/nl/aanbod/4172000/huis-verhuurd-in-3600-genk"><div class="estate"><div class="lbl">Verhuurd</div></div></div></div></div>`;
    const cards = ["4493977/huis-te-huur-in-3600-genk", "4346385/huis-verhuurd-in-3600-genk", "4172000/huis-verhuurd-in-3600-genk"].map((p) => `${site}/nl/aanbod/${p}`);
    expect(Object.fromEntries(cardStatuses(html, `${site}/nl/te-huur/woningen`, cards))).toEqual({ [cards[1]!]: "rented", [cards[2]!]: "rented" });
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

  it("reads how many pages a load-more list says it has", () => {
    expect(statedPages(`<div class="jet-listing-grid__items" data-nav="{}" data-page="1" data-pages="43" data-listing-source="query">`)).toBe(43);
    expect(statedPages(`<div data-page="1" data-pages="1">`)).toBe(null);
    expect(statedPages(`<div class="cards">`)).toBe(null);
    expect(statedPages(`<li>card</li> <div class="page load" id="page-2" data-items="24"></div> <div class="page load" id="page-9" data-items="6"></div>`)).toBe(9);
  });

  it("follows the link an infinite-scroll list loads its next page from", () => {
    const site = "https://www.example.be";
    const first = `<div class="estate-list"><div class="infinite-scroll"> <a href='/fr/List/InfiniteScroll?json=%7B%22PageNumber%22%3A0%7D'></a></div></div>`;
    expect(nextPageLinks(first, `${site}/fr/2/chercher-bien/a-vendre`)).toEqual([`${site}/fr/List/InfiniteScroll?json=%7B%22PageNumber%22%3A0%7D`]);
    const loaded = `<a href="/fr/bien/a-vendre/maison/5360-hamois/7914908" class="estate-card">x</a> <a href='/fr/List/InfiniteScroll?json=%7B%22FirstPage%22%3Afalse%7D'>next page</a>`;
    expect(nextPageLinks(loaded, `${site}/fr/List/InfiniteScroll?json=%7B%22PageNumber%22%3A0%7D`)).toEqual([`${site}/fr/List/InfiniteScroll?json=%7B%22FirstPage%22%3Afalse%7D`]);
    expect(nextPageLinks(`<a class="next" href="#">next page</a><a href="/contact">Contact</a>`, `${site}/kopen`)).toEqual([]);
  });

  it("raises the page number a loaded infinite-scroll page's next link still carries, as the site's script does", () => {
    const site = "https://www.bienatoi.be";
    const page = (first: boolean, n: number) => `${site}/fr/List/InfiniteScroll?json=%7B%22FirstPage%22%3A${first},%22MaxItemsPerPage%22%3A5,%22PageNumber%22%3A${n},%22CustomQuery%22%3A%22%5C%22PurposeIDList%5C%22%3A%5B1%5D%22%7D`;
    const loaded = (n: number) => `<a href="/fr/bien/a-vendre/maison/4500-huy/7926968">x</a> <a href='${page(false, n).replace(site, "")}'>next page</a>`;
    // Page 0 links "next page" with PageNumber 0 still: page 1 is read.
    expect(nextPageLinks(loaded(0), page(true, 0))).toEqual([page(false, 1)]);
    expect(nextPageLinks(loaded(0), page(false, 1))).toEqual([page(false, 2)]);
    // A link that already carries a later page is followed as written.
    expect(nextPageLinks(loaded(3), page(false, 1))).toEqual([page(false, 3)]);
    // From the overview itself, the loader's first address is read as it is.
    expect(nextPageLinks(`<div class="infinite-scroll"> <a href='${page(true, 0).replace(site, "")}'></a></div>`, `${site}/fr/2/chercher-bien/a-vendre`)).toEqual([page(true, 0)]);
  });

  it("takes no sold-or-rented overview for a card, even numbered like a listing", () => {
    const site = "https://www.bienatoi.be";
    const card = (path: string) => `<div class="estate"><a href="${path}"><h3>Maison</h3><p>3 chambres 150 m² 295.000 €</p></a></div>`;
    const html = `<header><a href="/fr/2/chercher-bien/a-vendre">A vendre</a></header><div><a href="/fr/10002/biens/vendu-loue">Vendu/Loué</a></div>${card("/fr/bien/a-vendre/maison/4500-huy/7926968")}${card("/fr/bien/a-vendre/maison/5000-namur/7797697")}`;
    expect(listingLinks(html, `${site}/fr/2/chercher-bien/a-vendre`, site).sort()).toEqual([`${site}/fr/bien/a-vendre/maison/4500-huy/7926968`, `${site}/fr/bien/a-vendre/maison/5000-namur/7797697`]);
  });

  it("reads a card's badge with an accent", () => {
    const card = (id: number, badge: string) => `<div class="bien"><a href="/index.php?p=listerDetailsBiens&bien=${id}"><h3>Appartement</h3><span class="badge">${badge}</span><p>2 chambres 80 m²</p></a></div>`;
    const html = `<div class="list">${card(7883525, "loué")}${card(7880919, "loué")}${card(7895618, "sous option")}${card(7915591, "Nouveau")}</div>`;
    const urls = [7883525, 7880919, 7895618, 7915591].map((id) => `https://www.bdgimmo.be/index.php?p=listerDetailsBiens&bien=${id}`);
    const statuses = cardStatuses(html, "https://www.bdgimmo.be/index.php?p=listerBiens&action=L", urls);
    expect([...urls].map((u) => statuses.get(u) ?? "active")).toEqual(["rented", "rented", "under_offer", "active"]);
  });

  it("takes one card, not its row, when a linked card sits among unlinked rented ones", () => {
    const rented = (city: string) => `<div class="span3 property "><div class="pic"><img alt="Maison à ${city}"></div><div class="property-info"><div class="prop-type">Maison</div><div class="prop-price"> Loué </div><div class="icons">2 ch 105 m&sup2;</div></div></div>`;
    const linked = (id: number, price: string) => `<div class="span3 property "><div class="pic"><div class="image"><a href="/fr/a-louer?view=detail&amp;id=${id}&amp;page=2"><img alt="KOT à MONS - Prix ${price} &euro;"></a></div></div><div class="property-info"><div class="prop-type">KOT/chambre</div><div class="prop-price pull-right">${price} &euro;</div><div class="icons">1 ch 15 m&sup2;</div></div></div>`;
    const html = `<html><body><div class="property-list"><div class="row-fluid">${rented("Mons")}${rented("Nimy")}${linked(1392, "420")}${rented("Baudour")}</div><div class="row-fluid">${rented("Jemappes")}${rented("Cuesmes")}${rented("Mons")}${linked(1368, "2.500")}</div><div class="row-fluid">${rented("A")}${rented("B")}${rented("C")}${rented("D")}</div></div></body></html>`;
    const urls = [1392, 1368].map((id) => `https://www.immotop.be/fr/a-louer?view=detail&id=${id}&page=2`);
    const statuses = cardStatuses(html, "https://www.immotop.be/fr/a-louer?page=2", urls);
    expect(urls.map((u) => statuses.get(u) ?? "active")).toEqual(["active", "active"]);
  });
});
