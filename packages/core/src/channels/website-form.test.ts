import { describe, expect, it } from "vitest";
import type { InboundEmail } from "./inbound-email";
import { pageKey, parseWebsiteForm, siteDomain } from "./website-form";

const mail = (over: Partial<InboundEmail>): InboundEmail => ({
  recipient: "immo-zone-k3f9@mail.example.be",
  from: { name: "Immo Zone website", email: "noreply@immo-zone.be" },
  replyTo: null,
  subject: "Nieuw contactformulier",
  text: "",
  strippedText: null,
  messageId: "<form-1@immo-zone.be>",
  inReplyTo: null,
  references: [],
  ...over,
});

const site = { url: "https://www.immo-zone.be/nl", listingUrls: ["https://www.immo-zone.be/nl/te-koop/gent/woning/1234"] };

describe("parseWebsiteForm", () => {
  it("reads a contact form sent by the agency's site, with the listing page and the visit request", () => {
    const lead = parseWebsiteForm(
      mail({
        subject: "Aanvraag bezoek via website",
        text: [
          "Naam: Sofie Claes",
          "E-mail: sofie.claes@example.com",
          "Telefoon: 0475 12 34 56",
          "Bericht: Is de tuin op het zuiden? Ik zou de woning graag bezoeken.",
          "",
          "Verzonden vanaf https://immo-zone.be/nl/te-koop/gent/woning/1234/?utm=x",
        ].join("\n"),
      }),
      site,
    );
    expect(lead).toEqual({
      name: "Sofie Claes",
      email: "sofie.claes@example.com",
      phone: "0475123456",
      message: "Is de tuin op het zuiden? Ik zou de woning graag bezoeken.",
      listingUrl: "https://www.immo-zone.be/nl/te-koop/gent/woning/1234",
      agencyReference: null,
      language: "nl",
      visitRequested: true,
    });
  });

  it("takes a form mailer's mail when it links the agency's site, and a question without a visit", () => {
    const lead = parseWebsiteForm(
      mail({
        from: { name: null, email: "wordpress@mailer.hosting.eu" },
        subject: "Nouveau message",
        text: "Nom: Luc Martin\nAdresse e-mail: luc@example.fr\nMessage: Quel est le revenu cadastral ?\nRéférence: 3583\nPage: https://www.immo-zone.be/fr/a-vendre/3583",
      }),
      site,
    );
    expect(lead).toMatchObject({ name: "Luc Martin", email: "luc@example.fr", agencyReference: "3583", listingUrl: null, language: "fr", visitRequested: false });
  });

  it("ignores mail that the site didn't send, portal mail and forms without a way to reach the client", () => {
    const form = "Naam: Jan\nE-mail: jan@example.com\nBericht: Bezoek?";
    expect(parseWebsiteForm(mail({ from: { name: "Jan", email: "jan@example.com" }, text: form }), site)).toBeNull();
    expect(parseWebsiteForm(mail({ from: { name: null, email: "noreply@other-site.be" }, text: form }), site)).toBeNull();
    expect(parseWebsiteForm(mail({ from: { name: null, email: "noreply@immoweb.be" }, text: form }), site)).toBeNull();
    expect(parseWebsiteForm(mail({ text: "Naam: Jan\nE-mail: info@immo-zone.be\nBericht: test" }), site)).toBeNull();
    expect(parseWebsiteForm(mail({ text: form }), { url: null })).toBeNull();
  });
});

describe("siteDomain and pageKey", () => {
  it("compare addresses without scheme, www, query or trailing slash", () => {
    expect(siteDomain("www.immo-zone.be")).toBe("immo-zone.be");
    expect(pageKey("https://www.Immo-Zone.be/nl/x/?a=1#b")).toBe(pageKey("http://immo-zone.be/nl/x"));
  });
});
