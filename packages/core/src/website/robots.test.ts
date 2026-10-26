import { describe, expect, it } from "vitest";
import { parseRobots } from "./robots";

describe("robots.txt", () => {
  it("honours the * group, its crawl delay and wildcards", () => {
    const robots = parseRobots(`User-agent: AhrefsBot
User-agent: SemrushBot
Disallow: /

User-agent: *
Disallow: /*pdf
Disallow: /*?filter=
Crawl-delay: 10
Sitemap: https://www.immodavinci.be/sitemap.xml`);
    expect(robots.crawlDelay).toBe(10);
    expect(robots.sitemaps).toEqual(["https://www.immodavinci.be/sitemap.xml"]);
    expect(robots.allowed("https://www.immodavinci.be/residentieel/detail/7917339/te-koop-woning")).toBe(true);
    expect(robots.allowed("https://www.immodavinci.be/docs/brochure-pdf")).toBe(false);
    expect(robots.allowed("https://www.immodavinci.be/aanbod/kopen?filter=huis")).toBe(false);
  });

  it("lets the longest rule win and Allow win a tie", () => {
    const robots = parseRobots(`User-agent: *
Disallow: /fr/
Allow: /fr/a-vendre/
Disallow: /nl/te-koop/alle$
Disallow: /tmp
Allow: /tmp`);
    expect(robots.allowed("https://s.be/fr/contact")).toBe(false);
    expect(robots.allowed("https://s.be/fr/a-vendre/8000-brugge/huis/x-123456")).toBe(true);
    expect(robots.allowed("https://s.be/nl/te-koop/alle")).toBe(false);
    expect(robots.allowed("https://s.be/nl/te-koop/alle/huis")).toBe(true);
    expect(robots.allowed("https://s.be/tmp/x")).toBe(true);
  });

  it("uses a group naming our crawler instead of *", () => {
    const robots = parseRobots(`User-agent: *
Disallow: /
Crawl-delay: 10

User-agent: ViewingBot
Allow: /`);
    expect(robots.allowed("https://s.be/detail/1234567/x")).toBe(true);
    expect(robots.crawlDelay).toBeNull();
    expect(parseRobots("User-agent: bot\nDisallow: /").allowed("https://s.be/x")).toBe(true);
    expect(parseRobots("User-agent: *\nDisallow:").allowed("https://s.be/x")).toBe(true);
  });
});
