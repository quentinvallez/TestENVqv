# Email, WhatsApp and portal leads: one-time setup

Until these are set, every message is stored with "Not delivered" and nothing reaches a client. Each part works on its own; set them up in any order.

**Never paste keys or tokens into chat or code.** They go only into Vercel → Settings → Environment Variables (Production and Preview).

| What | Provider | Data location |
|---|---|---|
| Agency email out, replies and portal leads in | Mailgun, **EU region** | Frankfurt |
| Email from an agent's own mailbox | Gmail / Outlook (see [setup-calendars.md](setup-calendars.md)) | The agency's own Google or Microsoft tenant |
| WhatsApp | Meta WhatsApp Cloud API | Meta; see the WhatsApp section |

---

## 1. Email (Mailgun EU)

Every agency gets an inbox address such as `immo-peeters-k3f9@mail.yourdomain.be` (Settings → Channels). Mail sent from the platform uses it as Reply-To, so client replies always land in the inbox, even when an agent sends from Gmail or Outlook. Agents without a connected mailbox send from that address.

1. Create an account at https://signup.mailgun.com. When asked, pick the **EU** region (the region can't be changed later for a domain).
2. **Sending → Domains → Add new domain**: a subdomain you own, e.g. `mail.yourdomain.be`, region **EU**.
3. Add the DNS records Mailgun shows (SPF, DKIM, and the two **MX** records so the subdomain can receive mail) at your domain registrar, then click **Verify**.
4. **Receiving → Create route**:
   - Expression type: *Match recipient*, recipient `.*@mail.yourdomain.be`
   - Action: **Forward** to `https://testenvqv.vercel.app/api/channels/email/inbound` (leave **Store and notify** unticked).
   - Priority 0, description "Inbox".
5. **API security**: create a **sending API key** and copy the **HTTP webhook signing key**.
6. In Vercel add:
   - `MAILGUN_API_KEY`
   - `MAILGUN_DOMAIN` = `mail.yourdomain.be`
   - `MAILGUN_WEBHOOK_SIGNING_KEY`
   - `MAILGUN_API_BASE` only if you are not on the EU region (default `https://api.eu.mailgun.net`)

Test: in Settings → Channels, copy the inbox address and send it an email from your phone. It should appear in the inbox with a draft reply within a few seconds.

## 2. Portal leads (Immoweb, Zimmo, Immovlan)

Immoweb, Zimmo and Immovlan email each lead to the address the agency gave them. The agency adds a forwarding rule in its own mailbox: mails from `immoweb.be`, `zimmo.be` and `immovlan.be` → forward to the inbox address. Each lead becomes:

- a contact (matched on email or phone if they're already known),
- a lead with source Immoweb/Zimmo for the listing, matched on the portal code (Listings → Immoweb ID) or the agency's reference, assigned to that listing's agent,
- a conversation in the inbox with a draft reply offering free viewing times, waiting for approval.

The same client asking twice about the same home adds to the existing lead. A lead whose listing can't be matched still comes in, without a listing.

The parser reads labelled fields ("Naam:", "Nom :", "E-mail:", "Telefoon:", "Message:") in Dutch, French and English. Portals change their emails from time to time; when a lead comes in without a name or listing, send the email (with personal details blurred) so the parser can be adjusted.

Direct portal integrations (Immoweb's lead API for software partners) can replace the forwarding later; they call the same `portal_leads_receive` tool.

## 3. WhatsApp (Cloud API)

Meta stores WhatsApp Cloud API data in its own data centres; turn on **Cloud API local storage** for the number in an EU location when Meta offers it for your account, and mention WhatsApp in the agency's privacy notice. If strict EU-only processing is required, an EU Business Solution Provider such as 360dialog can be added behind the same `sendMessage` interface.

1. https://business.facebook.com → create or pick the company's **Business portfolio** and verify the business (KBO/BCE extract).
2. https://developers.facebook.com → **Create app** → type **Business** → add the **WhatsApp** product.
3. **WhatsApp → API Setup**: add a phone number that is not used in the WhatsApp app, verify it by SMS. Copy the **Phone number ID**.
4. **Business settings → System users** → add a system user (Admin) → **Generate token** for the app with `whatsapp_business_messaging` and `whatsapp_business_management`, expiry **Never**. Copy the token.
5. **WhatsApp → Configuration → Webhook**:
   - Callback URL `https://testenvqv.vercel.app/api/channels/whatsapp`
   - Verify token: a random string you choose (also goes into Vercel below)
   - Subscribe to the **messages** field.
6. **App settings → Basic**: copy the **App secret**.
7. In Vercel add:
   - `WHATSAPP_APP_SECRET`
   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - For the shared platform number (pilots, and the valuation codes): `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, and `WHATSAPP_VERIFY_NUMBER` (the number as clients see it, e.g. `+32 470 12 34 56`).

An agency with its own number connects it in Settings → Channels with its phone number ID, number and system-user token. Its number must be in the same Meta app, so the webhook above receives its messages.

### The 24-hour rule and templates

WhatsApp allows free text only within 24 hours of the client's last message. After that only pre-approved **templates** can start a conversation. Replies drafted by the planner are almost always inside the window. Reminders and follow-ups use these templates; when the window is closed and no template applies, the message goes by email if we have the client's address.

Create them in **WhatsApp Manager → Message templates**, each in Dutch (`nl`), French (`fr`) and English (`en`), with exactly these names and variables:

**viewing_reminder** (category Utility). Variables: 1 first name, 2 address, 3 date and time, 4 agent name.
- nl: Dag {{1}}, een herinnering aan uw bezoek aan {{2}} op {{3}} met {{4}}. Past het toch niet? Antwoord gerust op dit bericht.
- fr: Bonjour {{1}}, petit rappel de votre visite de {{2}} le {{3}} avec {{4}}. Un empêchement ? Répondez simplement à ce message.
- en: Hi {{1}}, a reminder of your viewing at {{2}} on {{3}} with {{4}}. Can't make it? Just reply to this message.

**no_show_rebook** (category Utility). Variables: 1 first name, 2 address.
- nl: Dag {{1}}, we hebben u gemist bij het bezoek aan {{2}}. Wilt u een nieuw moment plannen? Antwoord gerust op dit bericht.
- fr: Bonjour {{1}}, nous ne vous avons pas vu à la visite de {{2}}. Souhaitez-vous fixer un nouveau rendez-vous ? Répondez simplement à ce message.
- en: Hi {{1}}, we missed you at the viewing of {{2}}. Would you like to plan a new time? Just reply to this message.

**viewing_cancelled** (category Utility). Sent when a listing with planned viewings goes under option, is sold or rented. Variables: 1 first name, 2 address, 3 date and time.
- nl: Dag {{1}}, uw bezoek aan {{2}} op {{3}} gaat helaas niet door: het pand is niet langer beschikbaar. Antwoord gerust op dit bericht, dan zoeken we iets anders voor u.
- fr: Bonjour {{1}}, votre visite de {{2}} le {{3}} est malheureusement annulée : le bien n'est plus disponible. Répondez simplement à ce message et nous chercherons autre chose pour vous.
- en: Hi {{1}}, your viewing at {{2}} on {{3}} is unfortunately cancelled: the property is no longer available. Just reply to this message and we'll look for something else for you.

**lead_nudge** (Meta will likely classify it as Marketing, which costs more per message). Variables: 1 first name, 2 address.
- nl: Dag {{1}}, bent u nog geïnteresseerd in {{2}}? We plannen graag een bezoek met u in. Antwoord gerust op dit bericht.
- fr: Bonjour {{1}}, êtes-vous toujours intéressé(e) par {{2}} ? Nous organisons volontiers une visite. Répondez simplement à ce message.
- en: Hi {{1}}, are you still interested in {{2}}? We'd be happy to plan a viewing. Just reply to this message.

## For developers

- Outbound: `sendMessage(ctx, { conversationId, body, subject?, kind?, whatsappTemplate?, metadata? })` and `conversationFor(ctx, { contactId, channel? })` in `packages/core/src/channels`. Returns `delivery: "sent" | "failed" | "simulated"` and records `message.sent` or `message.failed`. The `conversations_reply` tool (what approving a draft runs) calls it.
- Inbound: `/api/channels/email/inbound` (Mailgun, signature checked) and `/api/channels/whatsapp` (Meta, `X-Hub-Signature-256` checked) resolve the agency in `@viewing/core/inbound`, then call `messages_receive_email` / `messages_receive_whatsapp`. Both deduplicate on the provider's message id.
- Without any of the variables above everything still works, stored as "simulated".
