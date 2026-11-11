import { and, eq, sql, type Database, type Transaction, schema } from "@viewing/db";
import type { Lang } from "../planner/language";
import { normalizePhone } from "./phone";

/*
 * WhatsApp only lets a business start a conversation with someone who agreed
 * to it, so the client writes first. Client emails end with a link that opens
 * WhatsApp with a prefilled message carrying a short reference to the contact.
 * When that message arrives, the number is linked to the contact and WhatsApp
 * becomes their channel (whatsappOptIn). Pure helpers plus the lookup.
 */

/** Eight characters from the random end of the contact id: enough to find the contact, nothing personal. */
export const inviteRef = (contactId: string) => contactId.slice(-8).toUpperCase();

/** The reference in a client's WhatsApp message, e.g. "… (ref K7P2QXM4)". */
export const parseInviteRef = (text: string) => text.match(/\br[ée]f\.?[:\s]+([0-9a-z]{8})\b/i)?.[1]?.toUpperCase() ?? null;

const prefilled: Record<Lang, (ref: string) => string> = {
  nl: (ref) => `Hallo, ik volg liever via WhatsApp. (ref ${ref})`,
  fr: (ref) => `Bonjour, je préfère continuer sur WhatsApp. (ref ${ref})`,
  en: (ref) => `Hi, I'd rather continue on WhatsApp. (ref ${ref})`,
};

const invitation: Record<Lang, string> = {
  nl: "Liever via WhatsApp? Stuur ons een bericht, dan helpen we u daar verder:",
  fr: "Vous préférez WhatsApp ? Envoyez-nous un message et nous continuerons là-bas :",
  en: "Prefer WhatsApp? Send us a message and we'll continue there:",
};

/** The link that opens WhatsApp to the agency's number with the prefilled message. */
export function whatsappInviteLink(number: string, contactId: string, lang: Lang) {
  return `https://wa.me/${normalizePhone(number)}?text=${encodeURIComponent(prefilled[lang](inviteRef(contactId)))}`;
}

/** The line added at the end of a client email. */
export function whatsappInviteLine(number: string, contactId: string, lang: Lang) {
  return `${invitation[lang]}\n${whatsappInviteLink(number, contactId, lang)}`;
}

/** The contact a reference belongs to, in one agency or (on the shared platform number) in any. */
export async function contactForInviteRef(db: Database | Transaction, ref: string, agencyId?: string) {
  const rows = await db
    .select({ id: schema.contacts.id, agencyId: schema.contacts.agencyId, phone: schema.contacts.phone, whatsappOptIn: schema.contacts.whatsappOptIn })
    .from(schema.contacts)
    .where(and(sql`right(${schema.contacts.id}, 8) = ${ref.toLowerCase()}`, agencyId ? eq(schema.contacts.agencyId, agencyId) : undefined))
    .limit(2);
  // Two matches (possible across agencies) is ambiguous: better no link than the wrong client.
  return rows.length === 1 ? rows[0]! : null;
}
