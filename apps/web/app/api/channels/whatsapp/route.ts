import { createHmac, timingSafeEqual } from "node:crypto";
import { runTool, tools } from "@viewing/core";
import { agencyForWhatsApp, agencyForWhatsAppMessage, inboundContext, parseWhatsAppWebhook } from "@viewing/core/inbound";
import { after } from "next/server";

export const dynamic = "force-dynamic";

/** Meta checks the webhook URL once with the verify token set in the app dashboard. */
export function GET(request: Request) {
  const url = new URL(request.url);
  const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Messages and delivery updates from the WhatsApp Cloud API, signed with the Meta app secret. */
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected = secret ? `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}` : "";
  if (!secret || expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const batches = parseWhatsAppWebhook(JSON.parse(raw));
  after(async () => {
    for (const batch of batches) {
      // On the shared platform number each message may belong to another agency, so route one by one.
      for (const message of batch.messages) {
        const agencyId = await agencyForWhatsApp(batch.phoneNumberId, message.from, message.text);
        if (!agencyId) {
          console.warn("WhatsApp message for no known agency", batch.phoneNumberId);
          continue;
        }
        await runTool(tools.receiveWhatsApp, inboundContext(agencyId, "whatsapp"), { messages: [message], statuses: [] }).catch((error) =>
          console.error("Inbound WhatsApp failed", message.id, error),
        );
      }
      for (const status of batch.statuses) {
        const agencyId = await agencyForWhatsAppMessage(status.id);
        if (agencyId) await runTool(tools.receiveWhatsApp, inboundContext(agencyId, "whatsapp"), { messages: [], statuses: [status] }).catch(console.error);
      }
    }
  });
  return Response.json({ ok: true });
}
