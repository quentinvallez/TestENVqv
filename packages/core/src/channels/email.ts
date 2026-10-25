import { randomUUID } from "node:crypto";

/*
 * Building and sending plain-text email. Three transports: the agent's own Gmail
 * or Outlook mailbox when they connected it, otherwise the agency's address on
 * the platform's mail domain through Mailgun's EU region.
 */

export type OutgoingEmail = {
  from: { name: string; address: string };
  to: { name?: string; address: string };
  replyTo?: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  date?: Date;
};

export function mailDomain() {
  return process.env.MAILGUN_DOMAIN || null;
}

export function mailgunConfigured() {
  return Boolean(process.env.MAILGUN_API_KEY && mailDomain());
}

export function newMessageId(domain = mailDomain() ?? "viewing.local") {
  return `<${randomUUID()}@${domain}>`;
}

/** RFC 2047 encoded word for headers with non-ASCII characters (accents in Dutch and French names). */
function encodeHeader(value: string) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function address(a: { name?: string; address: string }) {
  if (!a.name) return a.address;
  const name = /^[\x20-\x7e]*$/.test(a.name) ? `"${a.name.replace(/(["\\])/g, "\\$1")}"` : encodeHeader(a.name);
  return `${name} <${a.address}>`;
}

/** The message as RFC 5322 text, for Gmail's raw send. */
export function buildMime(email: OutgoingEmail): string {
  const headers = [
    ["From", address(email.from)],
    ["To", address(email.to)],
    email.replyTo && ["Reply-To", email.replyTo],
    ["Subject", encodeHeader(email.subject)],
    ["Date", (email.date ?? new Date()).toUTCString()],
    ["Message-ID", email.messageId],
    email.inReplyTo && ["In-Reply-To", email.inReplyTo],
    email.references?.length && ["References", email.references.join(" ")],
    ["MIME-Version", "1.0"],
    ["Content-Type", 'text/plain; charset="UTF-8"'],
    ["Content-Transfer-Encoding", "base64"],
  ].filter(Boolean) as [string, string][];
  const body = Buffer.from(email.text, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  return `${headers.map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n${body}\r\n`;
}

export async function sendWithMailgun(email: OutgoingEmail): Promise<void> {
  const base = process.env.MAILGUN_API_BASE ?? "https://api.eu.mailgun.net";
  const form = new URLSearchParams({
    from: address(email.from),
    to: address(email.to),
    subject: email.subject,
    text: email.text,
    "h:Message-Id": email.messageId,
  });
  if (email.replyTo) form.set("h:Reply-To", email.replyTo);
  if (email.inReplyTo) form.set("h:In-Reply-To", email.inReplyTo);
  if (email.references?.length) form.set("h:References", email.references.join(" "));
  const response = await fetch(`${base}/v3/${mailDomain()}/messages`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString("base64")}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Mailgun ${response.status}: ${(await response.text()).slice(0, 300)}`);
}
