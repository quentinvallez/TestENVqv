import { runTool, tools } from "@viewing/core";
import { agencyForRecipient, inboundContext, parseMailgunForm, verifyMailgunSignature } from "@viewing/core/inbound";
import { after } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Mailgun inbound route for *@MAILGUN_DOMAIN: client replies and Immoweb/Zimmo
 * lead emails forwarded by agencies. Answered at once and handled afterwards,
 * so the planner's draft never makes Mailgun time out; duplicates are ignored
 * by Message-ID.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const fields = Object.fromEntries([...form.entries()].filter((e): e is [string, string] => typeof e[1] === "string"));
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey || !verifyMailgunSignature(fields, signingKey)) return new Response("Invalid signature", { status: 401 });

  const email = parseMailgunForm(fields);
  const agencyId = await agencyForRecipient(email.recipient);
  // 406 tells Mailgun not to retry: nobody uses this address.
  if (!agencyId) return new Response("Unknown recipient", { status: 406 });

  after(async () => {
    try {
      await runTool(tools.receiveEmail, inboundContext(agencyId, "email"), email);
    } catch (error) {
      console.error("Inbound email failed", email.messageId, error);
    }
  });
  return Response.json({ ok: true });
}
