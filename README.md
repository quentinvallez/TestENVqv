# Viewing (codename)

The AI-native platform for real estate agencies, starting with the **planning agent**: portal leads in, viewings booked in the right agent's calendar, confirmations and reminders out, all handled by AI.

## Architecture in one minute

```
apps/web        Next.js back office, API routes, Inngest endpoint
packages/core   Tool registry: every action in the product, used by UI, API and AI agents
packages/db     Postgres schema (Drizzle), migrations, client
```

Five rules keep this AI-native rather than "a database with a chatbot":

1. **Every action is a tool** (`packages/core/src/tools`). Defined once with a zod schema. Pages call tools, and agents will call the same tools. `describeTools()` exports them in the format LLM tool-use and MCP expect.
2. **Everything is an event** (`recordEvent`). Written to the `events` table and published to Inngest so agent workflows can react. The log is also the activity feed and the agents' memory.
3. **Agents are durable workflows** (Inngest, `app/api/inngest`), so waits, retries and schedules survive restarts.
4. **Humans approve; agencies choose the autonomy.** Agents write `proposals`; `agency_settings.autonomy` decides what runs without approval.
5. **AI quality is measured.** Traces and evals arrive with the first AI features.

Every domain table carries `agency_id`; tools always filter on `ctx.agencyId`.

## Run locally

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in DATABASE_URL and BETTER_AUTH_SECRET
pnpm db:migrate
pnpm dev                              # http://localhost:3000
DATABASE_URL=postgres://… pnpm test   # unit tests + database tests
```

Sign up, then click **Load demo data** on the dashboard.

## Booking flow

- `/book/<listingId>`: public booking page. It finds the listing's agent and shows their free slots (working hours − appointments − calendar events − travel buffer).
- `/a/<token>`: the client's own page to change or cancel; this link goes into every confirmation and reminder.
- Calendar sync (Google, Outlook) lives in `packages/core/src/calendar`; see [docs/setup-calendars.md](docs/setup-calendars.md).

## Owners and tenants

- Each listing has an **access mode** (`listings.access`): "agent" (the agency has the key, only the agent's agenda counts), "owner" or "tenant" (someone lives there). Set it on the listing's **Owner** tab.
- Owners and tenants (`listing_occupants`) get a private link `/s/<token>`, no account: they give the weekly times the home can be visited, days away and the notice they need, see the upcoming viewings (visitors by first name and initial only), report a problem with one, and can subscribe to an iCal feed. The invitation with the link is a draft for approval.
- For an occupied home, bookable slots = the agent's free time ∩ the occupants' windows − their days away, with the larger notice. Viewings at the same house go back to back (no travel buffer). Booking takes a per-listing lock after the agent's. Without any window, visitors can only request a viewing.
- Occupants get an alert for each booked, moved or cancelled viewing and the evening before (fixed templates, sent automatically unless Settings → Automations says to ask first). If they change their times or report a problem, nothing is cancelled: the visitor's conversation gets a draft asking them to move.

## Channels

- Every outbound message goes through `sendMessage` (`packages/core/src/channels`): the agent's Gmail or Outlook, the agency's inbox address via Mailgun EU, or WhatsApp Cloud API. Without a provider it is stored as "simulated" and shown as not delivered.
- Client replies, WhatsApp messages and Immoweb/Zimmo/Immovlan lead emails come in through `/api/channels/*` and land in the inbox with a planner draft. Setup: [docs/setup-channels.md](docs/setup-channels.md).

## Automatic jobs

`packages/core/src/automations` runs on a schedule for every agency: a reminder the evening before each viewing, viewings marked done an hour after they end, a follow-up draft the next day, a draft with new times when an agent marks a no-show, and a check-in when a lead hasn't answered for a few days. Each job happens once per subject (`automation_runs`), so running them often is harmless. Everything is a draft in the inbox, except reminders when the agency turns on "Send reminders automatically" in Settings.

They run through Vercel Cron (`apps/web/vercel.json`, daily at 16:00 UTC, needs `CRON_SECRET`) and, once Inngest is connected, every 15 minutes (`automationsCron`). **Run now** in Settings runs them for your agency at once.

## Environments

| Environment | Where | Database |
|---|---|---|
| Preview | Every pull request gets a Vercel URL | Neon branch per preview (via the Vercel integration) |
| Production / staging | `main` on Vercel | Neon main branch |

Everything runs in Frankfurt (`fra1`, `eu-central-1`). Migrations run automatically during the Vercel build.

## Changing the schema

Edit `packages/db/src/schema/*.ts`, then `pnpm db:generate --name <change>` and commit the generated SQL in `packages/db/migrations`.
