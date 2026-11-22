import type { InboundEmail } from "./inbound-email";
import { emailPattern, first, forwardedSender, guessLanguage, labelledFields, labels, phonePattern, portalOfAddress, visitWords } from "./portals";

/*
 * A question or visit request sent with the contact form on the agency's own
 * website. The site mails it to the agency, and the agency forwards those
 * mails to the inbox address (or adds it as a recipient). Pure: the caller
 * passes the agency's website address and its listing pages.
 */

export type WebsiteFormLead = {
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  /** The listing page the form was sent from, when the mail links it. */
  listingUrl: string | null;
  agencyReference: string | null;
  language: "nl" | "fr" | "en" | "de" | null;
  /** The subject, request type or message asks for a visit. */
  visitRequested: boolean;
};

/** "https://www.immo-zone.be/nl/" → "immo-zone.be". */
export function siteDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const domainOf = (address: string | null | undefined) => address?.trim().toLowerCase().match(/@([a-z0-9.-]+)>?$/)?.[1] ?? null;
const onDomain = (host: string | null, domain: string) => Boolean(host) && (host === domain || host!.endsWith(`.${domain}`));
/** Addresses websites send their form mails from. */
const automatedSender = /^(no-?reply|do-?not-?reply|wordpress|website|web|webmaster|forms?|formulier|contact|info|mailer|notifications?)@/i;

/** Normalised page address for comparing: no scheme, no www, no trailing slash, no query or hash. */
export function pageKey(url: string) {
  return url.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
}

/** The form mail's request, or null when the mail isn't one sent by the agency's website. */
export function parseWebsiteForm(email: InboundEmail, site: { url: string | null; listingUrls?: string[] }): WebsiteFormLead | null {
  const domain = siteDomain(site.url);
  if (!domain) return null;
  if (portalOfAddress(email.from.email) || portalOfAddress(forwardedSender(email.text))) return null;
  const text = email.text;
  const links = [...text.matchAll(/https?:\/\/[^\s"'<>)]+/gi)].map((m) => m[0]);
  const siteLinks = links.filter((l) => onDomain(siteDomain(l), domain));
  const senders = [email.from.email, forwardedSender(text)].filter((s): s is string => Boolean(s));
  const fromSite = senders.some((s) => onDomain(domainOf(s), domain));
  const automated = senders.some((s) => automatedSender.test(s));
  // Sent by the site itself (its own domain), or by a form mailer that links back to the site.
  if (!fromSite && !(automated && siteLinks.length)) return null;

  const fields = labelledFields(text);
  const clientEmail = first(fields, labels.email)?.match(emailPattern)?.[0]?.toLowerCase() ?? (email.replyTo && !onDomain(domainOf(email.replyTo), domain) ? email.replyTo.toLowerCase() : null);
  const phone = first(fields, labels.phone)?.match(phonePattern)?.[0]?.replace(/[\s./-]/g, "") ?? null;
  // The agency's own address in the form is the recipient, not the client.
  const ownAddress = clientEmail && onDomain(domainOf(clientEmail), domain);
  const contactEmail = ownAddress ? null : clientEmail;
  if (!contactEmail && !phone) return null;

  const name =
    first(fields, labels.name) ?? ([first(fields, labels.firstName), first(fields, labels.lastName)].filter(Boolean).join(" ") || null);
  const message = first(fields, labels.message);
  const known = new Map((site.listingUrls ?? []).map((u) => [pageKey(u), u]));
  const listingUrl = siteLinks.map((l) => known.get(pageKey(l))).find(Boolean) ?? null;
  return {
    name: name?.replace(/\s+/g, " ").trim() || null,
    email: contactEmail,
    phone,
    message,
    listingUrl,
    agencyReference: first(fields, labels.reference),
    language: guessLanguage([...fields.keys()].join(" ") + " " + email.subject),
    visitRequested: [email.subject, first(fields, labels.requestType) ?? "", message ?? ""].some((t) => visitWords.test(t)),
  };
}
