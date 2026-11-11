import { runTool, tools } from "@viewing/core";
import { agencyForEmailMessageId, inboundContext, parseMailgunFailure, verifyMailgunSignature } from "@viewing/core/inbound";

export const dynamic = "force-dynamic";

/**
 * Mailgun "Permanent failure" webhook: an email we sent to a client bounced
 * (address doesn't exist, rejected as spam). The message is marked failed, so
 * the office sees it on the dashboard and can reach the client another way.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { signature?: { timestamp?: string; token?: string; signature?: string } } | null;
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey || !body?.signature || !verifyMailgunSignature(body.signature, signingKey)) return new Response("Invalid signature", { status: 401 });

  const failure = parseMailgunFailure(body);
  if (!failure) return Response.json({ ok: true, ignored: true });
  const agencyId = await agencyForEmailMessageId(failure.messageId);
  // Mail to agents (alerts, lead copies) isn't stored as a client message: nothing to mark.
  if (!agencyId) return Response.json({ ok: true, ignored: true });
  await runTool(tools.markEmailBounced, inboundContext(agencyId, "email"), failure);
  return Response.json({ ok: true });
}
