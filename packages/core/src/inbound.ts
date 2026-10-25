import { and, db, desc, eq, isNull, schema, sql } from "@viewing/db";
import type { ToolContext } from "./tool";
import { mailDomain } from "./channels/email";
import { aliasOf } from "./channels/inbound-email";
import { platformWhatsapp } from "./channels/whatsapp";

/*
 * Webhooks from Mailgun and WhatsApp arrive without a login. These lookups find
 * which agency a message belongs to; everything after that goes through tools
 * with inboundContext(agencyId), like public pages do with publicContext.
 */

export { parseMailgunForm, verifyMailgunSignature } from "./channels/inbound-email";
export { parseWhatsAppWebhook } from "./channels/whatsapp";

export function inboundContext(agencyId: string, source: "email" | "whatsapp"): ToolContext {
  return { db, agencyId, actor: { type: "system", id: source } };
}

/** The agency whose forwarding address received the email. */
export async function agencyForRecipient(recipient: string): Promise<string | null> {
  const alias = aliasOf(recipient, mailDomain());
  if (!alias) return null;
  const [row] = await db.select({ agencyId: schema.agencySettings.agencyId }).from(schema.agencySettings).where(eq(schema.agencySettings.inboundEmailAlias, alias));
  return row?.agencyId ?? null;
}

/**
 * The agency a WhatsApp message belongs to. An agency's own number decides
 * directly. On the shared platform number: the agency with a pending valuation
 * code for this phone, else the agency that last wrote to this phone on WhatsApp.
 */
export async function agencyForWhatsApp(phoneNumberId: string, from: string, text: string): Promise<string | null> {
  const [own] = await db
    .select({ agencyId: schema.agencySettings.agencyId })
    .from(schema.agencySettings)
    .where(sql`${schema.agencySettings.channels}->'whatsapp'->>'phoneNumberId' = ${phoneNumberId}`);
  if (own) return own.agencyId;
  if (platformWhatsapp()?.phoneNumberId !== phoneNumberId) return null;

  const phone = `+${from.replace(/\D/g, "")}`;
  const code = text.match(/\b(\d{6})\b/)?.[1];
  if (code) {
    const [valuation] = await db
      .select({ agencyId: schema.valuations.agencyId })
      .from(schema.valuations)
      .where(and(eq(schema.valuations.phone, phone), eq(schema.valuations.verificationCode, code), isNull(schema.valuations.verifiedAt)))
      .orderBy(desc(schema.valuations.createdAt))
      .limit(1);
    if (valuation) return valuation.agencyId;
  }
  const tail = from.replace(/\D/g, "").slice(-9);
  const [recent] = await db
    .select({ agencyId: schema.conversations.agencyId })
    .from(schema.conversations)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
    .where(and(eq(schema.conversations.channel, "whatsapp"), sql`right(regexp_replace(${schema.contacts.phone}, '\\D', '', 'g'), 9) = ${tail}`))
    .orderBy(desc(schema.conversations.lastMessageAt))
    .limit(1);
  return recent?.agencyId ?? null;
}

/** The agency that sent a WhatsApp message, for delivery updates. */
export async function agencyForWhatsAppMessage(externalId: string): Promise<string | null> {
  const [row] = await db.select({ agencyId: schema.messages.agencyId }).from(schema.messages).where(eq(schema.messages.externalId, externalId)).limit(1);
  return row?.agencyId ?? null;
}
