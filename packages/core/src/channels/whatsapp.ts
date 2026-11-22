import { eq, schema } from "@viewing/db";
import { decrypt } from "../crypto";
import type { ToolContext } from "../tool";
import { normalizePhone } from "./phone";

/*
 * WhatsApp through Meta's WhatsApp Cloud API. An agency can connect its own
 * business number (Settings); otherwise the platform number from the
 * environment is used, which is meant for pilots and for valuation codes.
 */

export type WhatsAppTemplate = { name: string; language: "nl" | "fr" | "en" | "de"; params: string[] };
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

/**
 * The codes a template may be approved under in Meta, plain language first.
 * Meta matches the code exactly: a template made as "Dutch (BEL)" is nl_BE and
 * isn't found as nl, so we try the regional variants agencies tend to pick.
 */
export function templateLanguageCodes(language: WhatsAppTemplate["language"]): string[] {
  return { nl: ["nl", "nl_BE"], fr: ["fr", "fr_BE"], en: ["en", "en_GB", "en_US"], de: ["de"] }[language];
}

export async function sendWhatsApp(config: WhatsAppConfig, to: string, message: { text: string } | { template: WhatsAppTemplate }): Promise<string> {
  const post = async (payload: Record<string, unknown>): Promise<{ id: string } | { status: number; error?: MetaError }> => {
    const response = await fetch(`${graph}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: normalizePhone(to), ...payload }),
    });
    const body = (await response.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: MetaError };
    const id = response.ok ? body.messages?.[0]?.id : undefined;
    return id ? { id } : { status: response.status, error: body.error };
  };
  const refused = (status: number, error: MetaError | undefined, template: string | null) => {
    const reason = `WhatsApp ${status}: ${error ? metaErrorText(error) : "no message id"}`;
    // Meta's own words, so the cause shows up in the runtime logs as well as on the message.
    console.warn("[whatsapp] send refused", { template, reason });
    return new Error(reason);
  };

  if ("text" in message) {
    const result = await post({ type: "text", text: { body: message.text, preview_url: true } });
    if ("id" in result) return result.id;
    throw refused(result.status, result.error, null);
  }
  const { template } = message;
  const components = template.params.length ? [{ type: "body", parameters: template.params.map((text) => ({ type: "text", text })) }] : [];
  let first: { status: number; error?: MetaError } | null = null;
  for (const code of templateLanguageCodes(template.language)) {
    const result = await post({ type: "template", template: { name: template.name, language: { code }, components } });
    if ("id" in result) return result.id;
    first ??= result;
    // Only "not in this language" is worth another code; anything else would fail the same way.
    if (result.error?.code !== 132001) throw refused(result.status, result.error, `${template.name}/${code}`);
  }
  throw refused(first!.status, first!.error, `${template.name}/${template.language}`);
}

type MetaError = { code?: number; title?: string; message?: string; error_data?: { details?: string } };

/** "[132001] Template name does not exist in the translation (template name (booking_confirmed) does not exist in en)". */
export function metaErrorText(error: MetaError): string {
  const text = error.message ?? error.title ?? "unknown error";
  const details = error.error_data?.details;
  return `${error.code ? `[${error.code}] ` : ""}${text}${details && !text.includes(details) ? ` (${details})` : ""}`;
}

const problems: Record<number, string> = {
  190: "the WhatsApp access token has expired or was revoked (Vercel: WHATSAPP_ACCESS_TOKEN)",
  131030: "this number isn't on the test number's list of allowed recipients in Meta",
  131026: "this number can't receive WhatsApp messages",
  131042: "Meta needs a payment method on the WhatsApp account",
  131047: "WhatsApp only allows templates 24 hours after the client's last message",
  131049: "Meta held the message back to limit marketing messages to this person",
  131056: "too many messages to this number in a short time",
  132000: "the template in Meta has a different number of variables",
  132001: "this template isn't approved in Meta in the client's language",
  132015: "the template is paused in Meta",
  132016: "the template is disabled in Meta",
  133010: "the WhatsApp number isn't registered with the Cloud API yet",
};

/** A plain sentence for the inbox from a stored WhatsApp error, when we know the Meta code. */
export function whatsappProblem(error: string | null | undefined): string | null {
  const code = error?.match(/\[(\d+)\]|#(\d+)/);
  const known = code ? problems[Number(code[1] ?? code[2])] : undefined;
  if (!known) return null;
  // 132001 names the missing language: "does not exist in en".
  const lang = error!.match(/does not exist in ([a-z]{2}(?:_[A-Z]{2})?)\b/)?.[1];
  return lang && known.includes("client's language") ? `${known} (${lang})` : known;
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
        statuses?: { id: string; status: string; errors?: MetaError[] }[];
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
          .map((s) => ({ id: s.id, status: s.status as WhatsAppInbound["statuses"][number]["status"], error: s.errors?.[0] ? metaErrorText(s.errors[0]) : null })),
      });
    }
  }
  return result;
}
