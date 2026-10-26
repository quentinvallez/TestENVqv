import { describe, expect, it } from "vitest";
import {
  boilerplateLines,
  extractListing,
  isListingPage,
  looksLikeListingUrl,
  looksLikeOverviewUrl,
  matchAgent,
  normalizeUrl,
  pageLinks,
  parseAmount,
  referenceFromUrl,
  robotsSitemaps,
  sitemapEntries,
  splitStreet,
} from "./extract";

// Shaped after real Belgian agency sites (a Whise-built Dutch site, a French
// label|value table, a site without labels for the reference and price).
const davinci = `<!doctype html><html lang="nl"><head>
<title>Huis te koop in het centrum van Sint-Denijs-Westrem | Immo Da Vinci</title>
<meta property="og:image" content="https://r2.storagewhise.eu/x/Pictures/7917339/640/d44697a3.png">
</head><body>
<nav><a href="/recent-verkocht">Recent verkocht</a><a href="/residentieel/kopen">Kopen</a></nav>
<h1>Huis te koop in het centrum van Sint-Denijs-Westrem</h1>
<div class="details">
  <dl><dt>Prijs</dt><dd>€ 362.500</dd></dl>
  <dl><dt>Referentie</dt><dd>7917339</dd></dl>
  <dl><dt>Locatie</dt><dd>Sint-Dionysiusstraat 54, 9051 Gent Sint-Denijs-Westrem</dd></dl>
  <dl><dt>Status</dt><dd>te koop</dd></dl>
  <dl><dt>Slaapkamers</dt><dd>2</dd></dl>
  <dl><dt>Badkamers</dt><dd>1</dd></dl>
  <dl><dt>Oppervlakte</dt><dd>ca. 176 m²</dd></dl>
  <dl><dt>Grond oppervlakte</dt><dd>ca. 115 m²</dd></dl>
  <dl><dt>EPC klasse</dt><dd>C</dd></dl>
  <dl><dt>EPC-score</dt><dd>254 kWh/m²/j</dd></dl>
</div>
<p>Charmante woning in het hart van Sint-Denijs-Westrem, op wandelafstand van winkels, scholen en openbaar vervoer. De woning beschikt over een ruime leefruimte, een ingerichte keuken en een zonnige stadstuin.</p>
<div class="agent">Uw contactpersoon: <strong>Bram Verraes</strong></div>
<footer>Immo Da Vinci · Verkocht en verhuurd sinds 1998</footer>
</body></html>`;

const trevi = `<html lang="fr"><head><title>Villa à vendre à Waterloo - Trevi</title></head><body>
<h1>Villa à vendre - Waterloo</h1>
<table>
<tr><td>Prix</td><td>995.000 €</td></tr>
<tr><td>Ref:</td><td>7892200</td></tr>
<tr><td>Adresse</td><td>Rue Victor Hugo 190</td></tr>
<tr><td>Code postal</td><td>1410 Waterloo</td></tr>
<tr><td>Nbre de chambres</td><td>5</td></tr>
<tr><td>Salle(s) de bain(s)</td><td>3</td></tr>
<tr><td>Superficie habitable</td><td>280 m²</td></tr>
<tr><td>Superficie terrain</td><td>14.15 ares</td></tr>
<tr><td>PEB</td><td>D</td></tr>
<tr><td>E spec</td><td>286kWh/an</td></tr>
</table>
<p>Mis en vente par TREVI Brabant - Waterloo</p>
</body></html>`;

const dewaele = `<html><head><title>Gezellige starterswoning met stadstuin te koop in Harelbeke</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Dewaele"}</script>
</head><body>
<h1>Gezellige starterswoning met stadstuin</h1>
<p>Andries Pevernagestraat 109, 8530 Harelbeke</p>
<ul><li>Slaapkamers | 2</li><li>Badkamers | 1</li><li>Bewoonbare oppervlakte | 120m²</li><li>Perceelsoppervlakte | 106m²</li><li>EPC | 505 kWh/m²</li></ul>
<p>De vermelde prijs is de instelprijs.</p>
<div>Cléo Derekx<br>Vastgoedmakelaar verkoop<br>0472 18 39 96</div>
</body></html>`;

const jsonLd = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "RealEstateListing",
      name: "Appartement met terras",
      sku: "ANT-2001",
      offers: { "@type": "Offer", price: "289000", priceCurrency: "EUR" },
      mainEntity: { "@type": "Apartment", numberOfBedrooms: 2, floorSize: { value: 92, unitCode: "MTK" }, address: { streetAddress: "Kerkstraat 12", postalCode: "2600", addressLocality: "Berchem" } },
      image: ["https://cdn.example.be/1.jpg"],
    },
  ],
})}</script></head><body><h1>Appartement te koop in Berchem</h1></body></html>`;

describe("listing URLs", () => {
  it("recognises listing pages of real agency sites and skips overviews", () => {
    expect(looksLikeListingUrl("https://www.immodavinci.be/residentieel/detail/7917339/te-koop-woning-huis-te-koop", "https://www.immodavinci.be")).toBe(true);
    expect(looksLikeListingUrl("https://www.trevi.be/fr/bien/7892200/41/villa/Waterloo", "https://trevi.be/")).toBe(true);
    expect(looksLikeListingUrl("https://www.dewaele.com/nl/te-koop/8530-harelbeke/huis/gezellige-starterswoning-d8500-26222-264763", "https://www.dewaele.com/nl")).toBe(true);
    expect(looksLikeListingUrl("https://www.dewaele.com/nl/te-koop/alle/huis", "https://www.dewaele.com")).toBe(false);
    expect(looksLikeListingUrl("https://www.dewaele.com/nl/blog/2024/123456-tips", "https://www.dewaele.com")).toBe(false);
    expect(looksLikeListingUrl("https://other.be/detail/7917339/x", "https://www.immodavinci.be")).toBe(false);
    expect(looksLikeOverviewUrl("https://www.immodavinci.be/residentieel/kopen", "https://www.immodavinci.be")).toBe(true);
    expect(looksLikeOverviewUrl("https://www.immodavinci.be/contact", "https://www.immodavinci.be")).toBe(false);
  });

  it("normalises links and reads sitemaps and robots.txt", () => {
    expect(normalizeUrl("/nl/te-koop/?utm_source=x#foto", "http://www.dewaele.com/nl")).toBe("https://www.dewaele.com/nl/te-koop");
    expect(pageLinks('<a href="/a/123456/x">x</a><a href="mailto:a@b.be">m</a><a href=\'#top\'>t</a>', "https://site.be/")).toEqual(["https://site.be/a/123456/x"]);
    expect(sitemapEntries("<sitemapindex><sitemap><loc>https://s.be/a.xml</loc></sitemap></sitemapindex>")).toEqual({ pages: [], sitemaps: ["https://s.be/a.xml"] });
    expect(sitemapEntries("<urlset><url><loc><![CDATA[https://s.be/p/123456]]></loc></url></urlset>").pages).toEqual(["https://s.be/p/123456"]);
    expect(robotsSitemaps("User-agent: *\nSitemap: https://s.be/sitemap.xml\n")).toEqual(["https://s.be/sitemap.xml"]);
    expect(referenceFromUrl("https://www.dewaele.com/nl/te-koop/8530-harelbeke/huis/x-d8500-26222-264763")).toBe("264763");
  });
});

describe("reading a listing page", () => {
  it("reads a Dutch label/value page", () => {
    const { listing } = extractListing(davinci, "https://www.immodavinci.be/residentieel/detail/7917339/te-koop-woning-huis-te-koop");
    expect(listing).toMatchObject({
      reference: "7917339",
      price: 362500,
      street: "Sint-Dionysiusstraat",
      houseNumber: "54",
      postcode: "9051",
      city: "Gent Sint-Denijs-Westrem",
      status: "active",
      transaction: "sale",
      propertyType: "house",
      bedrooms: 2,
      bathrooms: 1,
      livingArea: 176,
      plotArea: 115,
      epcLabel: "C",
      epcScore: 254,
      agentName: "Bram Verraes",
    });
    expect(listing.photos).toEqual(["https://r2.storagewhise.eu/x/Pictures/7917339/640/d44697a3.png"]);
    expect(listing.description).toMatch(/^Charmante woning/);
    expect(isListingPage(listing, davinci)).toBe(true);
  });

  it("reads a French table, with the plot in ares", () => {
    const { listing } = extractListing(trevi, "https://www.trevi.be/fr/bien/7892200/41/villa/Waterloo");
    expect(listing).toMatchObject({
      reference: "7892200",
      price: 995000,
      street: "Rue Victor Hugo",
      houseNumber: "190",
      postcode: "1410",
      city: "Waterloo",
      transaction: "sale",
      propertyType: "villa",
      bedrooms: 5,
      bathrooms: 3,
      livingArea: 280,
      plotArea: 1415,
      epcLabel: "D",
    });
  });

  it("falls back to the URL id when the page shows no reference or price", () => {
    const url = "https://www.dewaele.com/nl/te-koop/8530-harelbeke/huis/gezellige-starterswoning-d8500-26222-264763";
    const { listing } = extractListing(dewaele, url);
    expect(listing).toMatchObject({ reference: "264763", price: null, postcode: "8530", city: "Harelbeke", street: "Andries Pevernagestraat", houseNumber: "109", bedrooms: 2, livingArea: 120, plotArea: 106, epcScore: 505, transaction: "sale", propertyType: "house" });
    expect(isListingPage(listing, dewaele)).toBe(true);
    expect(matchAgent([{ name: "Valérie Baert" }, { name: "Cleo Derekx" }], dewaele)).toEqual({ name: "Cleo Derekx" });
  });

  it("prefers schema.org data when the site publishes it", () => {
    const { listing, structured } = extractListing(jsonLd, "https://www.example.be/aanbod/123456/appartement");
    expect(structured).toBe(true);
    expect(listing).toMatchObject({ reference: "ANT-2001", price: 289000, bedrooms: 2, livingArea: 92, street: "Kerkstraat", houseNumber: "12", postcode: "2600", city: "Berchem", propertyType: "apartment", photos: ["https://cdn.example.be/1.jpg"] });
  });

  it("doesn't take an overview page for a listing", () => {
    const cards = Array.from({ length: 20 }, (_, i) => `<div><a href="/detail/${7000000 + i}/x">Huis</a> € ${300 + i}.000 · 3 slaapkamers · 2000 Antwerpen</div>`).join("");
    const html = `<html><body><h1>Te koop</h1>${cards}</body></html>`;
    const { listing } = extractListing(html, "https://www.site.be/aanbod/kopen");
    expect(isListingPage(listing, html)).toBe(false);
  });

  it("parses Belgian amounts and street lines", () => {
    expect(parseAmount("€ 1.250.000")).toBe(1250000);
    expect(parseAmount("995 000 €")).toBe(995000);
    expect(parseAmount("€ 1.150,00 / maand")).toBe(1150);
    expect(splitStreet("Rue Victor Hugo 190 bte 3")).toEqual({ street: "Rue Victor Hugo", houseNumber: "190 bte 3" });
    expect(splitStreet("12, rue de la Loi")).toEqual({ street: "rue de la Loi", houseNumber: "12" });
  });

  it("reads a page with an unlabelled address and price, ignoring the office address in the footer", () => {
    const office = `<div class="site-footer"><p>Immo Zone BV</p><p>Keizersplein 71 9300 Aalst</p><p>BIV: Luxemburgstraat, 16B, 1000 BRUSSEL</p></div>`;
    const home = `<html><body><h1>Immo Zone</h1><a href="/kopen">Kopen</a>${office}</body></html>`;
    const page = (address: string, price: string) => `<html><head><meta property="og:image" content="https://cdn.omnicasapictures.com/x/97172AL.jpg?6392"></head><body>
<ul><li><a href="/kopen">Kopen</a></li><li><a href="/huren">Huren</a></li></ul>
<h2>Huis</h2><a href="#map">${address}</a><div class="price">${price}</div>
<h1>Volledig gerenoveerde stadswoning met 3 slaapkamers en patio in Kortrijk</h1>
<ul><li>Bewoonbare oppervlakte 112m2</li><li>Slaapkamers 3</li><li>Badkamers 1</li></ul>
<table><tr><td>Referentie</td><td>3628123</td></tr><tr><td>EPC</td><td>B</td></tr></table>
<p>Interesse?</p><p>Kristof Vanderbeken</p>${office}</body></html>`;
    const boilerplate = boilerplateLines(home);
    const sale = extractListing(page("Patersmotestraat 2 , KORTRIJK", "€ 300 000"), "https://www.immo-zone.be/te-koop/kortrijk/volledig-gerenoveerde-stadswoning/97172", boilerplate).listing;
    expect(sale).toMatchObject({ street: "Patersmotestraat", houseNumber: "2", city: "Kortrijk", price: 300000, reference: "3628123", transaction: "sale", bedrooms: 3, livingArea: 112, epcLabel: "B" });
    expect(sale.title).toBe("Volledig gerenoveerde stadswoning met 3 slaapkamers en patio in Kortrijk");
    expect(sale.photos).toEqual(["https://cdn.omnicasapictures.com/x/97172AL.jpg?6392"]);
    const rent = extractListing(page("Keizersplein 56 11, AALST", "€ 1 350/mnd"), "https://www.immo-zone.be/woning/97160", boilerplate).listing;
    expect(rent).toMatchObject({ street: "Keizersplein", houseNumber: "56 11", city: "Aalst", price: 1350, transaction: "rent" });
  });
});
