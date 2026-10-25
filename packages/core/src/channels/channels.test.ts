import { describe, expect, it } from "vitest";
import { buildMime } from "./email";
import { aliasOf, htmlToText, parseAddress, parseMailgunForm, verifyMailgunSignature, type InboundEmail } from "./inbound-email";
import { normalizePhone, samePhone } from "./phone";
import { parsePortalEmail } from "./portals";
import { parseWhatsAppWebhook } from "./whatsapp";
import { createHmac } from "node:crypto";

const mail = (overrides: Partial<InboundEmail>): InboundEmail => ({
  recipient: "peeters-k3f9@mail.example.be",
  from: { name: null, email: "client@example.be" },
  replyTo: null,
  subject: "",
  text: "",
  strippedText: null,
  messageId: "<1@example.be>",
  inReplyTo: null,
  references: [],
  ...overrides,
});

describe("phone numbers", () => {
  it("writes Belgian numbers in international form", () => {
    expect(normalizePhone("0470 12 34 56")).toBe("32470123456");
    expect(normalizePhone("+32 470/12.34.56")).toBe("32470123456");
    expect(normalizePhone("0032470123456")).toBe("32470123456");
    expect(normalizePhone("32470123456")).toBe("32470123456");
    expect(samePhone("0470123456", "+32470123456")).toBe(true);
    expect(samePhone("0470123456", null)).toBe(false);
  });
});

describe("outgoing email", () => {
  it("builds a threaded plain-text message with encoded accents", () => {
    const mime = buildMime({
      from: { name: "Sofie Maes · Vastgoed Peeters", address: "peeters@mail.example.be" },
      to: { name: "Hélène Dubois", address: "helene@example.be" },
      replyTo: "peeters@mail.example.be",
      subject: "Re: Visite à Gand",
      text: "Bonjour Hélène,\nÀ bientôt.",
      messageId: "<abc@mail.example.be>",
      inReplyTo: "<xyz@example.be>",
      references: ["<first@example.be>", "<xyz@example.be>"],
      date: new Date("2026-10-25T10:00:00Z"),
    });
    expect(mime).toContain("From: =?UTF-8?B?");
    expect(mime).toContain("<peeters@mail.example.be>");
    expect(mime).toContain("To: =?UTF-8?B?");
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain("In-Reply-To: <xyz@example.be>");
    expect(mime).toContain("References: <first@example.be> <xyz@example.be>");
    const body = mime.split("\r\n\r\n")[1]!.replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Bonjour Hélène,\nÀ bientôt.");
  });
});

describe("inbound email", () => {
  it("reads a Mailgun route post", () => {
    const email = parseMailgunForm({
      recipient: "Peeters-K3F9@mail.example.be",
      from: '"Jan Peeters" <Jan@Example.be>',
      subject: "Re: Bezoek",
      "body-plain": "Dat past.\n\n> eerder bericht",
      "stripped-text": "Dat past.",
      "message-headers": JSON.stringify([
        ["Message-Id", "<m2@example.be>"],
        ["In-Reply-To", "<m1@mail.example.be>"],
        ["References", "<m0@mail.example.be> <m1@mail.example.be>"],
      ]),
    });
    expect(email.from).toEqual({ name: "Jan Peeters", email: "jan@example.be" });
    expect(email.recipient).toBe("peeters-k3f9@mail.example.be");
    expect(email.strippedText).toBe("Dat past.");
    expect(email.messageId).toBe("<m2@example.be>");
    expect(email.references).toEqual(["<m0@mail.example.be>", "<m1@mail.example.be>"]);
    expect(aliasOf(email.recipient, "mail.example.be")).toBe("peeters-k3f9");
    expect(aliasOf("x@other.be", "mail.example.be")).toBeNull();
    expect(parseAddress("plain@example.be")).toEqual({ name: null, email: "plain@example.be" });
  });

  it("checks the Mailgun signature and refuses old posts", () => {
    const now = Date.parse("2026-10-25T10:00:00Z");
    const timestamp = String(now / 1000);
    const signature = createHmac("sha256", "key").update(timestamp + "tok").digest("hex");
    expect(verifyMailgunSignature({ timestamp, token: "tok", signature }, "key", now)).toBe(true);
    expect(verifyMailgunSignature({ timestamp, token: "tok", signature }, "other", now)).toBe(false);
    expect(verifyMailgunSignature({ timestamp, token: "tok", signature }, "key", now + 3600_000)).toBe(false);
  });

  it("turns HTML into lines", () => {
    expect(htmlToText("<table><tr><td>Naam</td><td>: Jan</td></tr><tr><td>Tel</td><td>: 0470</td></tr></table>")).toBe("Naam : Jan\nTel : 0470");
  });
});

describe("portal leads", () => {
  it("reads an Immoweb lead in Dutch", () => {
    const lead = parsePortalEmail(
      mail({
        from: { name: "Immoweb", email: "noreply@immoweb.be" },
        subject: "Nieuwe aanvraag voor uw zoekertje 11223344",
        text: [
          "Beste makelaar,",
          "",
          "U heeft een nieuwe aanvraag ontvangen via Immoweb.",
          "",
          "Naam: Jan Peeters",
          "E-mail: jan.peeters@example.be",
          "Telefoon: 0470 12 34 56",
          "Bericht: Ik wil dit huis graag bezoeken.",
          "Kan het zaterdag?",
          "",
          "Uw referentie: VP-2041",
          "Bekijk het zoekertje: https://www.immoweb.be/nl/zoekertje/huis/te-koop/gent/9000/11223344",
        ].join("\n"),
      }),
    );
    expect(lead).toEqual({
      portal: "immoweb",
      name: "Jan Peeters",
      email: "jan.peeters@example.be",
      phone: "0470123456",
      message: "Ik wil dit huis graag bezoeken.\nKan het zaterdag?",
      portalRef: "11223344",
      agencyReference: "VP-2041",
      language: "nl",
    });
  });

  it("reads an HTML Immoweb lead in French with first and last name", () => {
    const html =
      "<p>Vous avez reçu une nouvelle demande via Immoweb.</p><table>" +
      "<tr><td>Prénom:</td><td>Hélène</td></tr><tr><td>Nom de famille:</td><td>Dubois</td></tr>" +
      "<tr><td>Adresse e-mail:</td><td>helene@example.be</td></tr><tr><td>Téléphone:</td><td>+32 478 11 22 33</td></tr>" +
      "<tr><td>Message:</td><td>Je souhaite visiter ce bien.</td></tr></table>" +
      '<a href="https://www.immoweb.be/fr/annonce/appartement/a-vendre/bruxelles/1000/10987654?utm=x">Voir</a>';
    const lead = parsePortalEmail(mail({ from: { name: null, email: "info@immoweb.be" }, subject: "Nouvelle demande", text: htmlToText(html) + "\nhttps://www.immoweb.be/fr/annonce/appartement/a-vendre/bruxelles/1000/10987654?utm=x" }));
    expect(lead?.name).toBe("Hélène Dubois");
    expect(lead?.email).toBe("helene@example.be");
    expect(lead?.phone).toBe("+32478112233");
    expect(lead?.portalRef).toBe("10987654");
    expect(lead?.language).toBe("fr");
  });

  it("reads a Zimmo lead with the client in Reply-To", () => {
    const lead = parsePortalEmail(
      mail({
        from: { name: "Zimmo", email: "leads@zimmo.be" },
        replyTo: "an.claes@example.be",
        subject: "Nieuwe interesse via Zimmo",
        text: "Naam: An Claes\nGSM: 0499/88.77.66\nVraag: Is de woning nog beschikbaar?\n\nhttps://www.zimmo.be/nl/gent-9000/te-koop/huis/K7PQ2/",
      }),
    );
    expect(lead).toMatchObject({ portal: "zimmo", name: "An Claes", email: "an.claes@example.be", phone: "0499887766", portalRef: "K7PQ2" });
  });

  it("recognises a lead the agency forwarded from its own mailbox", () => {
    const lead = parsePortalEmail(
      mail({
        from: { name: "Vastgoed Peeters", email: "info@vastgoedpeeters.be" },
        subject: "Fwd: Nieuwe aanvraag via Immoweb",
        text: "---------- Doorgestuurd bericht ---------\nVan: Immoweb <noreply@immoweb.be>\n\nNaam: Tom Wouters\nE-mail: tom@example.be\nBericht: Graag meer info.\nhttps://www.immoweb.be/nl/zoekertje/appartement/te-koop/leuven/3000/9988776",
      }),
    );
    expect(lead).toMatchObject({ portal: "immoweb", email: "tom@example.be", portalRef: "9988776" });
  });

  it("ignores ordinary mail and portal newsletters without a client", () => {
    expect(parsePortalEmail(mail({ subject: "Re: bezoek", text: "Zaterdag past, tot dan." }))).toBeNull();
    expect(parsePortalEmail(mail({ from: { name: null, email: "news@immoweb.be" }, subject: "Uw maandoverzicht", text: "Uw zoekertjes kregen 120 views." }))).toBeNull();
  });
});

describe("WhatsApp webhook", () => {
  it("reads messages and delivery updates", () => {
    const [inbound] = parseWhatsAppWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "1055" },
                contacts: [{ wa_id: "32470123456", profile: { name: "Jan" } }],
                messages: [
                  { id: "wamid.1", from: "32470123456", timestamp: "1761386400", type: "text", text: { body: "Code 123456" } },
                  { id: "wamid.2", from: "32470123456", timestamp: "1761386401", type: "image" },
                ],
                statuses: [{ id: "wamid.out", status: "failed", errors: [{ title: "Re-engagement message" }] }],
              },
            },
          ],
        },
      ],
    });
    expect(inbound!.phoneNumberId).toBe("1055");
    expect(inbound!.messages.map((m) => [m.name, m.text])).toEqual([
      ["Jan", "Code 123456"],
      ["Jan", "[image]"],
    ]);
    expect(inbound!.statuses).toEqual([{ id: "wamid.out", status: "failed", error: "Re-engagement message" }]);
  });
});
