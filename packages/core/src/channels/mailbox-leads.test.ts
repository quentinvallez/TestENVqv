import { describe, expect, it } from "vitest";
import { graphToInbound, isLeadSender, newMessagesUrl, websiteDomain } from "./mailbox-leads";

describe("lead emails in an agent's Outlook", () => {
  const site = { domain: "immo-zone.be", agentEmails: ["quentin@immo-zone.be"] };

  it("opens only emails from the portals and the agency's own website", () => {
    expect(isLeadSender("noreply@immoweb.be", site)).toBe(true);
    expect(isLeadSender("leads@mail.zimmo.be", site)).toBe(true);
    expect(isLeadSender("info@immovlan.be", site)).toBe(true);
    expect(isLeadSender("contact@immoscoop.be", site)).toBe(true);
    expect(isLeadSender("noreply@immo-zone.be", site)).toBe(true);
    expect(isLeadSender("wordpress@www.immo-zone.be", site)).toBe(true);
    // A client, the bank, a lookalike domain, a colleague on the agency's domain: never opened.
    expect(isLeadSender("jan@example.be", site)).toBe(false);
    expect(isLeadSender("info@kbc.be", site)).toBe(false);
    expect(isLeadSender("noreply@immoweb.be.example.com", site)).toBe(false);
    expect(isLeadSender("x@notimmo-zone.be", site)).toBe(false);
    expect(isLeadSender("Quentin@immo-zone.be", site)).toBe(false);
    expect(isLeadSender(null, site)).toBe(false);
    expect(isLeadSender("noreply@immo-zone.be", { domain: null })).toBe(false);
  });

  it("finds the website's domain from its address", () => {
    expect(websiteDomain("https://www.immo-zone.be/nl/")).toBe("immo-zone.be");
    expect(websiteDomain("immo-zone.be")).toBe("immo-zone.be");
    expect(websiteDomain(null)).toBeNull();
  });

  it("lists new emails by sender and time only, oldest first", () => {
    const url = new URL(newMessagesUrl(new Date("2026-11-22T10:00:00Z")));
    expect(url.pathname).toBe("/v1.0/me/messages");
    expect(url.searchParams.get("$select")).toBe("id,receivedDateTime,from");
    expect(url.searchParams.get("$filter")).toBe("receivedDateTime ge 2026-11-22T10:00:00.000Z");
    expect(url.searchParams.get("$orderby")).toBe("receivedDateTime asc");
  });

  it("turns a Graph message into the same shape as a forwarded lead email", () => {
    const email = graphToInbound(
      {
        id: "AAMk-1",
        receivedDateTime: "2026-11-22T10:05:00Z",
        from: { emailAddress: { name: "Immoweb", address: "NoReply@Immoweb.be" } },
        replyTo: [{ emailAddress: { address: "Jan.Peeters@example.be" } }],
        subject: "Nieuwe aanvraag voor uw zoekertje 11223344",
        body: { contentType: "html", content: "<p>Naam: Jan Peeters<br>E-mail: jan.peeters@example.be</p>" },
        internetMessageId: "<abc@immoweb.be>",
        internetMessageHeaders: [{ name: "In-Reply-To", value: "<x@y>" }],
      },
      "Quentin@Agency.be",
    );
    expect(email).toEqual({
      recipient: "quentin@agency.be",
      from: { name: "Immoweb", email: "noreply@immoweb.be" },
      replyTo: "jan.peeters@example.be",
      subject: "Nieuwe aanvraag voor uw zoekertje 11223344",
      text: "Naam: Jan Peeters\nE-mail: jan.peeters@example.be",
      strippedText: null,
      messageId: "<abc@immoweb.be>",
      inReplyTo: "<x@y>",
      references: [],
    });
  });
});

describe("Outlook permissions", () => {
  it("asks for Mail.Read and recognises it as reading lead emails; Gmail is never asked to read", async () => {
    const { authorizeUrl, grantedCapabilities } = await import("../integrations/oauth");
    const microsoft = new URL(authorizeUrl("microsoft", { redirectUri: "https://x/cb", state: "s" })).searchParams.get("scope")!.split(" ");
    expect(microsoft).toContain("Mail.Read");
    const google = new URL(authorizeUrl("google", { redirectUri: "https://x/cb", state: "s" })).searchParams.get("scope")!;
    expect(google).not.toMatch(/gmail\.(readonly|modify)|mail\.google\.com/);
    expect(grantedCapabilities("microsoft", "https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read")).toEqual(["calendar", "mail", "leads"]);
    expect(grantedCapabilities("microsoft", "Calendars.ReadWrite Mail.Send")).toEqual(["calendar", "mail"]);
  });
});
