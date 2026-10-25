# Connecting Google and Outlook calendars and mailboxes: one-time setup

To read agents' free/busy time, write viewings into their calendars and send approved replies from their own mailbox, the platform needs one app registration at Google and one at Microsoft. Agents then click **Connect Google** or **Connect Outlook** on their page under Agents. You do this once, for the whole platform (not per agency).

Menu names change from time to time; if a label differs slightly, look for the closest match.

**Never paste client secrets into chat or code.** They go only into Vercel → Settings → Environment Variables.

---

## Before you start: a domain name

Google and Microsoft both want to see a real website for an app that other companies connect to: a home page, a privacy policy and terms, on a domain you own (not `vercel.app`). You can start in test mode without one, but verification needs it. Registering the product's domain is the first thing that should follow from choosing a name.

---

## 1. Google (Google Calendar)

Calendar access and `gmail.send` are *sensitive* scopes at Google, not *restricted* ones, so there is no paid security audit. (Reading mail would be restricted and need a yearly CASA audit; that's why client replies come back through the agency's inbox address instead of us reading the mailbox.) Verification is a review by Google that usually takes a few days to a few weeks.

1. Go to https://console.cloud.google.com and sign in with the company Google account.
2. **Create a project**: project picker at the top → **New project** → name it after the product → Create.
3. **Enable the API**: *APIs & Services* → *Library* → search **Google Calendar API** → **Enable**.
4. **Consent screen**: *Google Auth Platform* (or *APIs & Services → OAuth consent screen*) → **Get started**.
   - App name: the product name. Support email: yours.
   - Audience: **External**.
   - Contact email: yours. Accept the policy → Create.
5. **Scopes**: *Data access* → **Add or remove scopes** → add:
   - `https://www.googleapis.com/auth/calendar.events` (create and update viewings)
   - `https://www.googleapis.com/auth/calendar.freebusy` (read when agents are busy)
   - `https://www.googleapis.com/auth/gmail.send` (send approved replies from the agent's Gmail; send only, we never read the mailbox)
   - `openid`, `email`
   → Update → Save.
6. **Test users** (while the app is in testing): *Audience* → **Add users** → add your own Gmail address and any pilot agents. In testing mode, a connection expires after 7 days; that's normal until the app is published.
7. **Credentials**: *Clients* (or *Credentials → Create credentials → OAuth client ID*):
   - Application type: **Web application**, name "Web".
   - Authorized redirect URIs:
     - `https://testenvqv.vercel.app/api/calendar/google/callback`
     - `http://localhost:3000/api/calendar/google/callback`
   - Create. Copy the **Client ID** and **Client secret**.
8. In **Vercel → Settings → Environment Variables**, add for Production and Preview:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
9. Later, with a domain and privacy policy: *Branding* → fill in home page, privacy policy and terms links, verify the domain → **Publish app** and submit for verification.

---

## 2. Microsoft (Outlook / Microsoft 365)

1. Go to https://entra.microsoft.com and sign in. A free Microsoft account works; if the company has Microsoft 365, use that admin account.
2. *Identity* → *Applications* → **App registrations** → **New registration**:
   - Name: the product name.
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (so every agency can connect, whatever Microsoft account they use).
   - Redirect URI: platform **Web**, `https://testenvqv.vercel.app/api/calendar/microsoft/callback`
   - Register.
3. On the app's **Overview**, copy the **Application (client) ID**.
4. **Authentication** → under Web redirect URIs, add `http://localhost:3000/api/calendar/microsoft/callback` → Save.
5. **API permissions** → **Add a permission** → *Microsoft Graph* → **Delegated permissions** → tick:
   - `Calendars.ReadWrite`
   - `Mail.Send` (send approved replies from the agent's mailbox)
   - `offline_access`
   - `User.Read`, `openid`, `email`
   → Add permissions. Do **not** click "Grant admin consent"; each agency gives consent for its own account.
6. **Certificates & secrets** → **New client secret** → description "Vercel", expiry 24 months → Add. Copy the **Value** immediately (it is shown only once).
7. In **Vercel → Settings → Environment Variables**, add for Production and Preview:
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`
8. Later: **Branding & properties** → publisher domain and **publisher verification**. That needs a free Microsoft AI Cloud Partner Program ID. Many companies block unverified apps from other organizations, so do this before onboarding agencies on Microsoft 365.

---

## 3. Two more variables

Calendar, mailbox and WhatsApp tokens are stored encrypted. Add to Vercel:

- `CALENDAR_TOKEN_KEY`: a random string of 32+ characters (for example from https://generate-secret.vercel.app/32). Changing it later disconnects all calendars and mailboxes, so set it once and keep it.
- `APP_URL`: `https://testenvqv.vercel.app` for Production. The redirect URI must match the registration exactly, so connecting works on this address and on localhost, not on preview URLs.

---

## When you're done

The **Connect Google / Connect Outlook** buttons appear on each agent's page as soon as the variables are set. Connect your own account first and book a test viewing: it should appear in your calendar, and an event in your calendar should remove that time from the booking page.

The client is never added as an attendee of the calendar event, because Google and Outlook would then email them an invitation without anyone approving it.
