import type { InboundEmail } from "./inbound-email";

/*
 * Leads from Immoweb, Zimmo and Immovlan arrive as notification emails at the
 * agency (forwarded to the inbox address). The formats differ per portal and
 * change over time, so this reads labelled fields in Dutch, French and English
 * rather than relying on one exact layout.
 */

export type Portal = "immoweb" | "zimmo" | "immovlan";

export type PortalLead = {
  portal: Portal;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  /** The listing's code at the portal, e.g. Immoweb's 8-digit id. */
  portalRef: string | null;
  /** The agency's own reference, when the portal repeats it. */
  agencyReference: string | null;
  language: "nl" | "fr" | "en" | null;
};

const portalDomains: Record<Portal, RegExp> = {
  immoweb: /immoweb\.be/i,
  zimmo: /zimmo\.be/i,
  immovlan: /immovlan\.be/i,
};

const labels = {
  name: ["naam", "volledige naam", "nom", "nom et prénom", "nom complet", "name", "full name", "contact"],
  firstName: ["voornaam", "prénom", "first name"],
  lastName: ["achternaam", "familienaam", "nom de famille", "last name"],
  email: ["e-mail", "email", "e-mailadres", "emailadres", "adresse e-mail", "adresse email", "courriel", "mail", "email address"],
  phone: ["telefoon", "telefoonnummer", "tel", "tel.", "gsm", "téléphone", "numéro de téléphone", "phone", "phone number", "mobile"],
  message: ["bericht", "uw bericht", "vraag", "opmerking", "message", "votre message", "commentaire", "question", "comments", "your message"],
  reference: ["referentie", "uw referentie", "ref", "ref.", "référence", "votre référence", "reference", "your reference", "referentie makelaar", "référence agence"],
  portalRef: ["immoweb code", "code immoweb", "immoweb id", "id immoweb", "zimmo code", "code zimmo", "immovlan code", "code immovlan", "zoekertje", "annonce", "code"],
};

const french = /\b(nom|prénom|téléphone|votre|demande|bien|visite|référence)\b/i;
const dutch = /\b(naam|voornaam|telefoon|bericht|aanvraag|pand|bezoek|referentie|uw)\b/i;

function detectPortal(email: InboundEmail): Portal | null {
  const haystacks = [email.from.email, email.replyTo ?? "", email.subject, email.text.slice(0, 4000)];
  for (const portal of Object.keys(portalDomains) as Portal[]) {
    // The sender domain decides first; a forwarded mail only mentions the portal in its text.
    if (portalDomains[portal].test(email.from.email)) return portal;
  }
  for (const portal of Object.keys(portalDomains) as Portal[]) {
    if (haystacks.some((h) => portalDomains[portal].test(h)) && /(aanvraag|demande|request|contact|interesse|intéress|bezoek|visite)/i.test(email.subject + email.text.slice(0, 2000))) return portal;
  }
  return null;
}

const allLabels = Object.values(labels).flat().sort((a, b) => b.length - a.length);
const labelLine = new RegExp(`^\\s*[*•-]?\\s*(${allLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*[:：]\\s*(.*)$`, "i");

/** "Label: value" pairs; a message label takes the following lines until the next label or a blank line after text. */
function labelledFields(text: string) {
  const fields = new Map<string, string>();
  const lines = text.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(labelLine);
    if (!match) continue;
    const label = match[1]!.toLowerCase();
    let value = match[2]!.trim();
    if (labels.message.includes(label)) {
      const body: string[] = value ? [value] : [];
      for (let j = i + 1; j < lines.length && !labelLine.test(lines[j]!); j++) {
        const line = lines[j]!.trim();
        if (!line && body.length) break;
        if (line) body.push(line);
        i = j;
      }
      value = body.join("\n");
    }
    if (value && !fields.has(label)) fields.set(label, value);
  }
  return fields;
}

function first(fields: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = fields.get(key);
    if (value) return value;
  }
  return null;
}

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phonePattern = /(?:\+|00)?\d[\d\s./-]{7,}\d/;

function portalRefFrom(portal: Portal, text: string, labelled: string | null): string | null {
  if (portal === "immoweb") {
    // Classified URLs end in the 7–9 digit id, e.g. immoweb.be/nl/zoekertje/huis/te-koop/gent/9000/11223344
    const url = text.match(/immoweb\.be\/[^\s"'>]*?\/(\d{7,9})(?:[/?#\s"'>]|$)/i);
    if (url) return url[1]!;
    const code = (labelled ?? text).match(/\b(\d{7,9})\b/);
    return code?.[1] ?? null;
  }
  if (portal === "zimmo") {
    const url = text.match(/zimmo\.be\/[^\s"'>]*?\/([A-Z0-9]{5,8})\/?(?:[?#\s"'>]|$)/i);
    if (url) return url[1]!.toUpperCase();
    return labelled?.match(/\b([A-Z0-9]{5,8})\b/i)?.[1]?.toUpperCase() ?? null;
  }
  const url = text.match(/immovlan\.be\/[^\s"'>]*?\/([a-z]{2,4}\d{5,})/i);
  return url?.[1]?.toLowerCase() ?? labelled ?? null;
}

/** The lead in a portal notification email, or null when the email isn't one. */
export function parsePortalEmail(email: InboundEmail): PortalLead | null {
  const portal = detectPortal(email);
  if (!portal) return null;
  const text = email.text;
  const fields = labelledFields(text);

  const fullName =
    first(fields, labels.name) ??
    ([first(fields, labels.firstName), first(fields, labels.lastName)].filter(Boolean).join(" ") || null);
  const labelledEmail = first(fields, labels.email)?.match(emailPattern)?.[0] ?? null;
  // Portals often put the client in Reply-To; never take the portal's own address for the client.
  const replyTo = email.replyTo && !Object.values(portalDomains).some((d) => d.test(email.replyTo!)) ? email.replyTo : null;
  const clientEmail = (labelledEmail ?? replyTo)?.toLowerCase() ?? null;
  const phone = first(fields, labels.phone)?.match(phonePattern)?.[0]?.replace(/[\s./-]/g, "") ?? null;
  const message = first(fields, labels.message);

  if (!clientEmail && !phone) return null;
  const sample = [...fields.keys()].join(" ") + " " + email.subject;
  return {
    portal,
    name: fullName?.replace(/\s+/g, " ").trim() || null,
    email: clientEmail,
    phone,
    message,
    portalRef: portalRefFrom(portal, text, first(fields, labels.portalRef)),
    agencyReference: first(fields, labels.reference),
    language: french.test(sample) ? "fr" : dutch.test(sample) ? "nl" : /\b(name|phone|message|request)\b/i.test(sample) ? "en" : null,
  };
}
