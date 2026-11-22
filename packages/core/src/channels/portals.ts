import type { InboundEmail } from "./inbound-email";

/*
 * Leads from Immoweb, Zimmo, Immovlan and Immoscoop arrive as notification emails at the
 * agency (forwarded to the inbox address). The formats differ per portal and
 * change over time, so this reads labelled fields in Dutch, French and English
 * rather than relying on one exact layout.
 */

export const portals = ["immoweb", "zimmo", "immovlan", "immoscoop"] as const;
export type Portal = (typeof portals)[number];
export const portalNames: Record<Portal, string> = { immoweb: "Immoweb", zimmo: "Zimmo", immovlan: "Immovlan", immoscoop: "Immoscoop" };
/** The portals' own mail domains: their lead emails come from these (or a subdomain). */
export const portalDomains = ["immoweb.be", "zimmo.be", "immovlan.be", "immoscoop.be"] as const;

/** The portal an email address belongs to: name@immoweb.be or name@mail.immoweb.be, never immoweb.be.example.com. */
export function portalOfAddress(address: string | null | undefined): Portal | null {
  const domain = address?.trim().toLowerCase().match(/@([a-z0-9.-]+)>?$/)?.[1];
  if (!domain) return null;
  return portals.find((p, i) => domain === portalDomains[i] || domain.endsWith(`.${portalDomains[i]}`)) ?? null;
}

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
  language: "nl" | "fr" | "en" | "de" | null;
  /** The portal's subject or request type says the client asks for a visit ("Aanvraag bezoek", "Demande de visite"). */
  visitRequested: boolean;
};

const portalMentions: Record<Portal, RegExp> = {
  immoweb: /immoweb\.be/i,
  zimmo: /zimmo\.be/i,
  immovlan: /immovlan\.be/i,
  immoscoop: /immoscoop\.be/i,
};

export const labels = {
  name: ["naam", "volledige naam", "nom", "nom et prénom", "nom complet", "name", "full name", "contact"],
  firstName: ["voornaam", "prénom", "first name"],
  lastName: ["achternaam", "familienaam", "nom de famille", "last name"],
  email: ["e-mail", "email", "e-mailadres", "emailadres", "adresse e-mail", "adresse email", "courriel", "mail", "email address"],
  phone: ["telefoon", "telefoonnummer", "tel", "tel.", "gsm", "téléphone", "numéro de téléphone", "phone", "phone number", "mobile"],
  message: ["bericht", "uw bericht", "vraag", "opmerking", "message", "votre message", "commentaire", "question", "comments", "your message"],
  reference: ["referentie", "uw referentie", "ref", "ref.", "référence", "votre référence", "reference", "your reference", "referentie makelaar", "référence agence"],
  requestType: ["type aanvraag", "soort aanvraag", "aanvraag", "type de demande", "demande", "request type", "request", "onderwerp", "objet", "subject"],
  portalRef: ["immoweb code", "code immoweb", "immoweb id", "id immoweb", "zimmo code", "code zimmo", "immovlan code", "code immovlan", "immoscoop code", "code immoscoop", "zoekertje", "annonce", "code"],
};

/** A visit request in a subject or request-type field. Only those, never the whole mail: footers say "bezoek onze website". */
export const visitWords = /\b(bezoek\w*|bezichtig\w*|visite[rs]?|viewing|visit)\b/i;

const french = /\b(nom|prénom|téléphone|votre|demande|bien|visite|référence)\b/i;
const german = /\b(vorname|nachname|telefon|nachricht|anfrage|besichtigung|immobilie|ihre)\b/i;
const dutch = /\b(naam|voornaam|telefoon|bericht|aanvraag|pand|bezoek|referentie|uw)\b/i;

/** The language of a form's labels and subject, or null when they don't say. */
export function guessLanguage(sample: string): PortalLead["language"] {
  return french.test(sample) ? "fr" : german.test(sample) ? "de" : dutch.test(sample) ? "nl" : /\b(name|phone|message|request)\b/i.test(sample) ? "en" : null;
}

/** The original sender of a forwarded mail ("Van: Immoweb <noreply@immoweb.be>" in its first lines), if any. */
export function forwardedSender(text: string): string | null {
  const line = text.slice(0, 2000).match(/^\s*(?:from|van|de|von)\s*:\s*(.+)$/im)?.[1];
  return line?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;
}

/**
 * Which portal sent the lead, strongest evidence first: the sender's address
 * (portals mailing us directly, or a mailbox that redirects), the original
 * sender of a mail the agency forwarded, the portal's Reply-To, and only then
 * the portal named in the subject or the text, when it is the only one named.
 */
export function detectPortal(email: InboundEmail): Portal | null {
  const byAddress = portalOfAddress(email.from.email) ?? portalOfAddress(forwardedSender(email.text)) ?? portalOfAddress(email.replyTo);
  if (byAddress) return byAddress;
  if (!/(aanvraag|demande|request|contact|interesse|intéress|bezoek|visite)/i.test(email.subject + email.text.slice(0, 2000))) return null;
  const inSubject = portals.filter((p) => portalMentions[p].test(email.subject));
  if (inSubject.length === 1) return inSubject[0]!;
  // A footer or quoted mail can name another portal too: then the text doesn't say which one sent it.
  const inText = portals.filter((p) => portalMentions[p].test(email.text.slice(0, 4000)));
  return inText.length === 1 ? inText[0]! : null;
}

const allLabels = Object.values(labels).flat().sort((a, b) => b.length - a.length);
const labelLine = new RegExp(`^\\s*[*•-]?\\s*(${allLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*[:：]\\s*(.*)$`, "i");

/** "Label: value" pairs; a message label takes the following lines until the next label or a blank line after text. */
export function labelledFields(text: string) {
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

export function first(fields: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = fields.get(key);
    if (value) return value;
  }
  return null;
}

export const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
export const phonePattern = /(?:\+|00)?\d[\d\s./-]{7,}\d/;

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
  // Immoscoop: no sample email yet, so the listing is matched by the agency's own reference only.
  if (portal === "immoscoop") return labelled?.trim() || null;
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
  const replyTo = email.replyTo && !portalOfAddress(email.replyTo) ? email.replyTo : null;
  const clientEmail = (labelledEmail ?? replyTo)?.toLowerCase() ?? null;
  const phone = first(fields, labels.phone)?.match(phonePattern)?.[0]?.replace(/[\s./-]/g, "") ?? null;
  const message = first(fields, labels.message);

  if (!clientEmail && !phone) return null;
  const visitRequested = visitWords.test(email.subject) || visitWords.test(first(fields, labels.requestType) ?? "");
  const sample = [...fields.keys()].join(" ") + " " + email.subject;
  return {
    portal,
    name: fullName?.replace(/\s+/g, " ").trim() || null,
    email: clientEmail,
    phone,
    message,
    portalRef: portalRefFrom(portal, text, first(fields, labels.portalRef)),
    agencyReference: first(fields, labels.reference),
    language: guessLanguage(sample),
    visitRequested,
  };
}
