import { htmlToText, type InboundEmail } from "./inbound-email";
import { portalOfAddress } from "./portals";

/*
 * Lead emails read straight from an agent's Outlook (Microsoft Graph, Mail.Read).
 * We promise agencies to open only lead emails: those sent by Immoweb, Zimmo,
 * Immovlan or Immoscoop, or by the agency's own website (its contact form).
 * So we list new messages with their sender only, and fetch the content of a
 * message only when its sender is one of those. Pure, for tests.
 */

/** "https://www.immo-zone.be/nl/" → "immo-zone.be". */
export function websiteDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

const domainOf = (address: string | null | undefined) => address?.trim().toLowerCase().match(/@([a-z0-9.-]+)>?$/)?.[1] ?? null;

/**
 * Whether we may open an email from this sender: a portal (or its subdomain), or
 * the agency's website domain (contact form mails, often sent "from" info@).
 * Never the agents' own addresses on that domain: those are colleagues, not forms.
 */
export function isLeadSender(address: string | null | undefined, site: { domain: string | null; agentEmails?: string[] }): boolean {
  if (!address) return false;
  if (portalOfAddress(address)) return true;
  const domain = domainOf(address);
  if (!site.domain || !domain) return false;
  if (domain !== site.domain && !domain.endsWith(`.${site.domain}`)) return false;
  return !(site.agentEmails ?? []).some((e) => e.toLowerCase() === address.trim().toLowerCase());
}

/** The fields we ask Graph for when listing: the sender, time and folder, nothing about the content. */
export const listFields = "id,receivedDateTime,from,parentFolderId";
/** The fields we fetch of a lead email. */
export const leadFields = "id,receivedDateTime,from,replyTo,subject,body,internetMessageId,internetMessageHeaders";

type GraphAddress = { emailAddress?: { name?: string | null; address?: string | null } };
export type GraphMessageHeader = { id: string; receivedDateTime: string; from?: GraphAddress | null; parentFolderId?: string };
export type GraphMessage = GraphMessageHeader & {
  subject?: string | null;
  replyTo?: GraphAddress[] | null;
  body?: { contentType?: string; content?: string } | null;
  internetMessageId?: string | null;
  internetMessageHeaders?: { name: string; value: string }[] | null;
};

/** A Graph message in the same shape as an email arriving at the inbox address, for the same intake. */
export function graphToInbound(message: GraphMessage, recipient: string): InboundEmail {
  const header = (name: string) => message.internetMessageHeaders?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
  const content = message.body?.content ?? "";
  const text = message.body?.contentType?.toLowerCase() === "html" ? htmlToText(content) : content.replace(/\r\n/g, "\n").trim();
  const replyTo = message.replyTo?.[0]?.emailAddress?.address ?? null;
  return {
    recipient: recipient.toLowerCase(),
    from: { name: message.from?.emailAddress?.name?.trim() || null, email: (message.from?.emailAddress?.address ?? "").trim().toLowerCase() },
    replyTo: replyTo ? replyTo.trim().toLowerCase() : null,
    subject: message.subject ?? "",
    text,
    strippedText: null,
    messageId: message.internetMessageId ?? header("Message-ID"),
    inReplyTo: header("In-Reply-To"),
    references: (header("References") ?? "").split(/\s+/).filter(Boolean),
  };
}

/** Graph keeps an Outlook message subscription for at most 4230 minutes; we renew daily, so ask a little less. */
export const SUBSCRIPTION_MINUTES = 4200;

/** The page of new messages since the cursor, oldest first, with sender only. */
export function newMessagesUrl(since: Date) {
  return (
    "https://graph.microsoft.com/v1.0/me/messages?" +
    new URLSearchParams({
      $filter: `receivedDateTime ge ${since.toISOString()}`,
      $orderby: "receivedDateTime asc",
      $select: listFields,
      $top: "50",
    }).toString()
  );
}
