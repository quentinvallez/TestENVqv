import { eq, schema } from "@viewing/db";
import { decrypt } from "../crypto";
import type { ToolContext } from "../tool";
import { normalizePhone } from "./phone";

/*
 * WhatsApp through Meta's WhatsApp Cloud API. An agency can connect its own
 * business number (Settings); otherwise the platform number from the
 * environment is used, which is meant for pilots and for valuation codes.
 */

export type WhatsAppTemplate = { name: string; language: "nl" | "fr" | "en"; params: string[] };
export type WhatsAppConfig = { phoneNumberId: string; accessToken: string; displayNumber: string | null; own: boolean };

const graph = "https://graph.facebook.com/v21.0";

/** Free-form messages are only allowed within 24 hours of the client's last message. */
export const serviceWindowMs = 24 * 3600 * 1000;

export async function whatsappConfig(ctx: ToolContext): Promise<WhatsAppConfig | null> {
  const [row] = await ctx.db.select({ channels: schema.agencySettings.channels }).from(schema.agencySettings).where(eq(schema.agencySettings.agencyId, ctx.agencyId));
  const own = row?.channels.whatsapp;
  if (own) return { phoneNumberId: own.phoneNumberId, accessToken: decrypt(own.accessToken), displayNumber: own.displayNumber, own: true };
  return platformWhatsapp();
}

export function platformWhatsapp(): WhatsAppConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken, displayNumber: process.env.WHATSAPP_VERIFY_NUMBER ?? null, own: false };
}

export async function sendWhatsApp(config: WhatsAppConfig, to: string, message: { text: string } | { template: WhatsAppTemplate }): Promise<string> {
  const payload =
    "text" in message
      ? { type: "text", text: { body: message.text, preview_url: true } }
      : {
          type: "template",
          template: {
            name: message.template.name,
            language: { code: message.template.language },
            components: message.template.params.length ? [{ type: "body", parameters: message.template.params.map((text) => ({ type: "text", text })) }] : [],
          },
        };
  const response = await fetch(`${graph}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: normalizePhone(to), ...payload }),
  });
  const body = (await response.json()) as { messages?: { id: string }[]; error?: { message: string; code: number } };
  if (!response.ok || !body.messages?.[0]) throw new Error(`WhatsApp ${response.status}: ${body.error?.message ?? "no message id"}`);
  return body.messages[0].id;
}

export type WhatsAppInbound = {
  phoneNumberId: string;
  messages: { id: string; from: string; name: string | null; text: string; timestamp: Date }[];
  statuses: { id: string; status: "sent" | "delivered" | "read" | "failed"; error: string | null }[];
};

type WebhookBody = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: { id: string; from: string; timestamp: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } } }[];
        statuses?: { id: string; status: string; errors?: { title?: string; message?: string }[] }[];
      };
    }[];
  }[];
};

/** Messages and delivery updates in a Cloud API webhook call, grouped per business number. */
export function parseWhatsAppWebhook(body: unknown): WhatsAppInbound[] {
  const result: WhatsAppInbound[] = [];
  for (const entry of (body as WebhookBody).entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!value || !phoneNumberId) continue;
      const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      result.push({
        phoneNumberId,
        messages: (value.messages ?? []).map((m) => ({
          id: m.id,
          from: m.from,
          name: names.get(m.from) ?? null,
          // Media and locations become a short placeholder so the agent knows to open WhatsApp.
          text: m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type}]`,
          timestamp: new Date(Number(m.timestamp) * 1000),
        })),
        statuses: (value.statuses ?? [])
          .filter((s) => ["sent", "delivered", "read", "failed"].includes(s.status))
          .map((s) => ({ id: s.id, status: s.status as WhatsAppInbound["statuses"][number]["status"], error: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null })),
      });
    }
  }
  return result;
}
