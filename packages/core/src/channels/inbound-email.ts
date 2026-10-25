import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Email arriving at an agency's forwarding address, in a provider-neutral shape.
 * Mailgun posts it to /api/channels/email/inbound; another provider only needs
 * its own parse function.
 */

export type InboundEmail = {
  recipient: string;
  from: { name: string | null; email: string };
  replyTo: string | null;
  subject: string;
  /** Full plain text, with quoted history. */
  text: string;
  /** Only the new part of a reply, when the provider can tell. */
  strippedText: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
};

/** "Jan Peeters <jan@example.be>" → name and address. */
export function parseAddress(value: string): { name: string | null; email: string } {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1]!.trim() || null, email: match[2]!.trim().toLowerCase() };
  return { name: null, email: value.trim().toLowerCase() };
}

/** Rough plain text for HTML-only mails (many portal notifications), keeping line structure. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d|li|table)>/gi, "\n")
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function verifyMailgunSignature(fields: { timestamp?: string; token?: string; signature?: string }, signingKey: string, now = Date.now()) {
  const { timestamp, token, signature } = fields;
  if (!timestamp || !token || !signature) return false;
  // Refuse replays older than 15 minutes.
  if (Math.abs(now / 1000 - Number(timestamp)) > 15 * 60) return false;
  const expected = createHmac("sha256", signingKey).update(timestamp + token).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** The fields of a Mailgun inbound route ("forward" action) post. */
export function parseMailgunForm(fields: Record<string, string>): InboundEmail {
  let headers: [string, string][] = [];
  try {
    headers = JSON.parse(fields["message-headers"] ?? "[]");
  } catch {
    // Some test posts omit the headers; the named fields are enough.
  }
  const header = (name: string) => headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? fields[name] ?? null;
  const text = fields["body-plain"] || (fields["body-html"] ? htmlToText(fields["body-html"]) : "");
  return {
    recipient: (fields.recipient ?? "").split(",")[0]!.trim().toLowerCase(),
    from: parseAddress(fields.from ?? fields.sender ?? ""),
    replyTo: header("Reply-To") ? parseAddress(header("Reply-To")!).email : null,
    subject: fields.subject ?? header("Subject") ?? "",
    text,
    strippedText: fields["stripped-text"]?.trim() || null,
    messageId: header("Message-Id"),
    inReplyTo: header("In-Reply-To"),
    references: (header("References") ?? "").split(/\s+/).filter(Boolean),
  };
}

/** The alias part of an address on our mail domain: "peeters-k3f9@mail.x.be" → "peeters-k3f9". */
export function aliasOf(recipient: string, domain: string | null): string | null {
  const [local, host] = recipient.toLowerCase().split("@");
  if (!local || !host || (domain && host !== domain.toLowerCase())) return null;
  return local.split("+")[0]!;
}
