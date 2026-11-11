import { describe, expect, it } from "vitest";
import { inviteRef, parseInviteRef, whatsappInviteLine, whatsappInviteLink } from "./whatsapp-invite";

describe("WhatsApp invitation in client emails", () => {
  const contactId = "con_01jc9x0000k7p2qxm4";

  it("opens WhatsApp to the agency's number with a prefilled message carrying the reference", () => {
    expect(inviteRef(contactId)).toBe("K7P2QXM4");
    const link = new URL(whatsappInviteLink("+32 470 12 34 56", contactId, "nl"));
    expect(link.origin + link.pathname).toBe("https://wa.me/32470123456");
    expect(link.searchParams.get("text")).toBe("Hallo, ik volg liever via WhatsApp. (ref K7P2QXM4)");
    expect(whatsappInviteLine("0470 12 34 56", contactId, "fr")).toMatch(/^Vous préférez WhatsApp \?.*\nhttps:\/\/wa\.me\/32470123456\?text=/s);
  });

  it("finds the reference in what the client sends, even when they edit the message", () => {
    expect(parseInviteRef("Hallo, ik volg liever via WhatsApp. (ref K7P2QXM4)")).toBe("K7P2QXM4");
    expect(parseInviteRef("bonjour réf: k7p2qxm4 merci")).toBe("K7P2QXM4");
    expect(parseInviteRef("Is het huis nog vrij?")).toBeNull();
    expect(parseInviteRef("referentie 12345678")).toBeNull();
  });
});
