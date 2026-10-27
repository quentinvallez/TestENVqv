import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { id, timestamps } from "./columns";

// An agency is a Better Auth organization. Every domain row carries agencyId so
// tenant isolation is a single, uniform filter.
const agencyId = () =>
  text()
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export type Language = "nl" | "fr" | "en" | "de";

export type Branding = {
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  detectedFrom?: string;
};

/** What widget.js shows on the agency's website besides the placeholders it fills. */
export type WidgetSettings = {
  /** Floating "free valuation" button at the bottom right of every page. On unless turned off. */
  valuationLauncher?: boolean;
  /** Floating "book a viewing" button on listing pages found on the website, when the page has no placeholder. On unless turned off. */
  bookingLauncher?: boolean;
};

/**
 * The agency's own messaging channels. Tokens are encrypted by the integration
 * layer before they are stored here.
 */
export type ChannelSettings = {
  whatsapp?: { phoneNumberId: string; displayNumber: string; accessToken: string };
};

/** Outcome of the last import of listings from the agency's website. */
export type WebsiteSync = {
  lastRunAt?: string;
  /** When we last searched the sitemaps and overview pages for listing pages. */
  discoveredAt?: string;
  /** Listings read from the site so far. */
  found?: number;
  /** Listing pages found on the site, read or still to read. */
  pages?: number;
  created?: number;
  updated?: number;
  /** Listings whose page disappeared, now archived. */
  removed?: number;
  failed?: number;
  /** Listing pages the site's robots.txt doesn't let us read. */
  blocked?: number;
  /** Seconds the site's robots.txt asks between requests. */
  crawlDelay?: number;
  /** Pages still to read; the next run continues with them. */
  remaining?: number;
  error?: string;
};

/** Which automatic jobs run for the agency. Every job is on unless turned off. */
export type AutomationSettings = {
  /** Reminder the day before a viewing or valuation visit. Sent on its own only when autonomy.reminders is "act". */
  reminders?: boolean;
  /** After a viewing that ended, mark it completed and draft a follow-up the next day. */
  followUps?: boolean;
  /** Draft a message with new times when an agent marks a client as a no-show. */
  noShows?: boolean;
  /** Draft a nudge when a lead has not answered our last message. */
  nudges?: boolean;
  /** Days without an answer before a nudge. */
  nudgeAfterDays?: number;
};

/** How much an AI agent may do on its own, per capability. */
export type Autonomy = Record<string, "suggest" | "act_and_notify" | "act">;

export const agencySettings = pgTable("agency_settings", {
  agencyId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  websiteUrl: text(),
  inboundEmailAlias: text().unique(),
  defaultLanguage: text().$type<Language>().notNull().default("nl"),
  timezone: text().notNull().default("Europe/Brussels"),
  branding: jsonb().$type<Branding>().notNull().default({}),
  autonomy: jsonb().$type<Autonomy>().notNull().default({}),
  widget: jsonb().$type<WidgetSettings>().notNull().default({}),
  channels: jsonb().$type<ChannelSettings>().notNull().default({}),
  automations: jsonb().$type<AutomationSettings>().notNull().default({}),
  websiteSync: jsonb().$type<WebsiteSync>().notNull().default({}),
  ...timestamps,
});

export const offices = pgTable(
  "offices",
  {
    id: id("ofc"),
    agencyId: agencyId(),
    name: text().notNull(),
    street: text(),
    postcode: text(),
    city: text(),
    phone: text(),
    email: text(),
    ...timestamps,
  },
  (t) => [index().on(t.agencyId)],
);

/** A real estate agent. May exist before they have a login (userId null). */
export const agents = pgTable(
  "agents",
  {
    id: id("agt"),
    agencyId: agencyId(),
    officeId: text().references(() => offices.id, { onDelete: "set null" }),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    name: text().notNull(),
    // Agents read from the agency's website often have only a phone number.
    email: text(),
    phone: text(),
    avatarUrl: text(),
    source: text().$type<"website">(), // set when the agent was added from the agency's website
    color: text(),
    languages: jsonb().$type<Language[]>().notNull().default(["nl"]),
    slotMinutes: smallint().notNull().default(30),
    bufferMinutes: smallint().notNull().default(15),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.agencyId), uniqueIndex().on(t.agencyId, t.email)],
);

/** Weekly working hours used to compute bookable slots. */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: id("avl"),
    agencyId: agencyId(),
    agentId: text()
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    weekday: smallint().notNull(), // 0 = Sunday
    startMinute: smallint().notNull(), // minutes after midnight, local time
    endMinute: smallint().notNull(),
  },
  (t) => [index().on(t.agentId)],
);

export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: id("cal"),
    agencyId: agencyId(),
    agentId: text()
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    provider: text().$type<"google" | "microsoft">().notNull(),
    accountEmail: text().notNull(),
    // Encrypted at rest by the integration layer, never stored in plain text.
    credentials: text().notNull(),
    // What the agent allowed: "calendar" (busy times, viewings in their agenda) and "mail" (send from their mailbox).
    scopes: jsonb().$type<("calendar" | "mail")[]>().notNull().default(["calendar"]),
    syncState: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: text().$type<"active" | "expired" | "revoked">().notNull().default("active"),
    ...timestamps,
  },
  (t) => [index().on(t.agentId), uniqueIndex().on(t.agentId, t.provider)],
);

export type ListingStatus = "draft" | "active" | "under_offer" | "sold" | "rented" | "archived";
/**
 * Who opens the door for viewings. "agent": the agency has the key, so only the
 * agent's agenda counts. "owner" / "tenant": someone lives there and gives the
 * times the home can be visited through their own link.
 */
export type ListingAccess = "agent" | "owner" | "tenant";

export const listings = pgTable(
  "listings",
  {
    id: id("lst"),
    agencyId: agencyId(),
    officeId: text().references(() => offices.id, { onDelete: "set null" }),
    agentId: text().references(() => agents.id, { onDelete: "set null" }),
    reference: text().notNull(),
    status: text().$type<ListingStatus>().notNull().default("draft"),
    transaction: text().$type<"sale" | "rent">().notNull(),
    propertyType: text().notNull(), // house, apartment, villa, land, commercial...
    title: text(),
    description: text(),
    street: text(),
    houseNumber: text(),
    postcode: text(),
    city: text(),
    price: integer(), // euros (monthly rent for rentals)
    bedrooms: smallint(),
    bathrooms: smallint(),
    livingArea: integer(), // m²
    plotArea: integer(), // m²
    epcScore: integer(), // kWh/m²/year
    epcLabel: text(),
    features: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    photos: jsonb().$type<{ url: string; caption?: string }[]>().notNull().default([]),
    websiteUrl: text(),
    // External references such as { immoweb: "11223344" }, used to match portal leads.
    portalRefs: jsonb().$type<Record<string, string>>().notNull().default({}),
    // For sold or rented listings: when, and the final price, used as comparables in valuations.
    soldAt: timestamp({ withTimezone: true }),
    soldPrice: integer(),
    access: text().$type<ListingAccess>().notNull().default("agent"),
    // Hours of notice the occupants need before a viewing; null = the usual minimum.
    viewingNoticeHours: smallint(),
    ...timestamps,
  },
  (t) => [index().on(t.agencyId, t.status), uniqueIndex().on(t.agencyId, t.reference)],
);

/**
 * The owner or tenant of a listing. Their private link (`token`, no account)
 * lets them give the times the home can be visited, see upcoming viewings and
 * report a problem; they get an alert for each booked, moved or cancelled viewing.
 */
export const listingOccupants = pgTable(
  "listing_occupants",
  {
    id: id("occ"),
    agencyId: agencyId(),
    listingId: text()
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    contactId: text()
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: text().$type<"owner" | "tenant">().notNull(),
    token: text()
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    alerts: boolean().notNull().default(true),
    lastSeenAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.agencyId, t.listingId), uniqueIndex().on(t.listingId, t.contactId)],
);

/** Weekly times a listing can be visited, as its occupants gave them; local time like availability_rules. */
export const listingWindows = pgTable(
  "listing_windows",
  {
    id: id("lsw"),
    agencyId: agencyId(),
    listingId: text()
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    weekday: smallint().notNull(), // 0 = Sunday
    startMinute: smallint().notNull(),
    endMinute: smallint().notNull(),
  },
  (t) => [index().on(t.listingId)],
);

/** Periods the occupants can't receive visitors, e.g. a holiday. */
export const listingBlocks = pgTable(
  "listing_blocks",
  {
    id: id("lsb"),
    agencyId: agencyId(),
    listingId: text()
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    note: text(),
  },
  (t) => [index().on(t.listingId, t.startsAt)],
);

/**
 * Pages of the agency's own website that the importer has read: listing pages
 * (linked to the listing they filled), and other pages so they aren't read again.
 */
export const websitePages = pgTable(
  "website_pages",
  {
    id: id("wpg"),
    agencyId: agencyId(),
    url: text().notNull(),
    kind: text().$type<"pending" | "listing" | "other" | "gone" | "error">().notNull().default("pending"),
    listingId: text().references(() => listings.id, { onDelete: "set null" }),
    /** Hash of the page text, so unchanged pages aren't read again by the AI. */
    contentHash: text(),
    /** What read the listing facts: structured data in the page, our rules, or Claude. */
    extractedBy: text().$type<"structured" | "rules" | "ai">(),
    /** The contact person named on the page, also when they aren't one of the agency's agents yet. */
    agentName: text(),
    lastError: text(),
    lastCheckedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.agencyId, t.url), index().on(t.listingId), index().on(t.agencyId, t.kind)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id("con"),
    agencyId: agencyId(),
    firstName: text(),
    lastName: text(),
    email: text(),
    phone: text(),
    language: text().$type<Language>(),
    whatsappOptIn: boolean().notNull().default(false),
    notes: text(),
    ...timestamps,
  },
  (t) => [index().on(t.agencyId, t.email), index().on(t.agencyId, t.phone)],
);

/** Answers a client gave to the widget's qualifying questions. */
export type Qualification = {
  answers: { id: string; question: string; answer: string }[];
  /** Rule-based: hot = ready to act soon, warm = interested, cold = early or unlikely. */
  temperature?: "hot" | "warm" | "cold";
};

export type LeadSource = "immoweb" | "zimmo" | "immovlan" | "website" | "whatsapp" | "phone" | "manual" | "valuation";
/** What the client wants from the agency: buy or rent a listing, or sell their own property. */
export type LeadIntent = "buy" | "rent" | "sell";
export type LeadStage = "new" | "invited" | "booked" | "visited" | "follow_up" | "offer" | "won" | "lost";

export const leads = pgTable(
  "leads",
  {
    id: id("led"),
    agencyId: agencyId(),
    contactId: text()
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    listingId: text().references(() => listings.id, { onDelete: "set null" }),
    agentId: text().references(() => agents.id, { onDelete: "set null" }),
    source: text().$type<LeadSource>().notNull(),
    intent: text().$type<LeadIntent>().notNull().default("buy"),
    stage: text().$type<LeadStage>().notNull().default("new"),
    message: text(),
    qualification: jsonb().$type<Qualification>(),
    ...timestamps,
  },
  (t) => [index().on(t.agencyId, t.stage), index().on(t.listingId)],
);

export type AppointmentStatus = "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show";

export const appointments = pgTable(
  "appointments",
  {
    id: id("apt"),
    agencyId: agencyId(),
    agentId: text()
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    listingId: text().references(() => listings.id, { onDelete: "set null" }),
    contactId: text().references(() => contacts.id, { onDelete: "set null" }),
    leadId: text().references(() => leads.id, { onDelete: "set null" }),
    type: text().$type<"viewing" | "valuation" | "call" | "other">().notNull().default("viewing"),
    status: text().$type<AppointmentStatus>().notNull().default("scheduled"),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    location: text(),
    notes: text(),
    externalEventId: text(), // event id in the agent's Google/Outlook calendar
    manageToken: text()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()), // for cancel/reschedule links
    ...timestamps,
  },
  (t) => [index().on(t.agencyId, t.startsAt), index().on(t.agentId, t.startsAt)],
);

export type Channel = "email" | "whatsapp" | "sms";
/** Where a conversation lives: the agent's mailbox, the agency's own address, or the business WhatsApp number. */
export type ChannelProvider = "outlook" | "gmail" | "email" | "whatsapp_business" | "sms";
export type ConversationCategory =
  | "valuation"
  | "booking"
  | "viewing_request"
  | "reschedule"
  | "cancellation"
  | "question"
  | "offer"
  | "feedback"
  | "confirmation"
  | "other";
export type Priority = "high" | "normal" | "low";

export type ValuationAnswers = {
  propertyType: "house" | "apartment" | "villa";
  livingArea: number;
  plotArea?: number;
  bedrooms: number;
  bathrooms: number;
  yearBuilt?: number;
  condition: "to_renovate" | "good" | "renovated" | "new";
  epcLabel?: "A+" | "A" | "B" | "C" | "D" | "E" | "F";
  kitchen?: "basic" | "standard" | "high_end";
  extras: ("garage" | "garden" | "terrace" | "pool" | "solar")[];
  plans?: "sell_soon" | "sell_later" | "curious";
};

export type ValuationResult = {
  low: number;
  high: number;
  point: number;
  confidence: "high" | "medium" | "low";
  method: "market_and_comparables" | "market" | "comparables";
  /** Statbel figures used; `period` like "Q3 2025 – Q2 2026" for the last four quarters. */
  marketMedian?: { municipality: string; propertyType: string; year: number; period?: string; median: number; transactions: number };
  adjustments: { key: string; factor: number }[];
  comparables: { street: string; city: string; propertyType: string; livingArea: number | null; price: number; soldAt: string }[];
};

/** A home valuation requested through the website widget; becomes a seller lead once the phone is verified. */
export const valuations = pgTable(
  "valuations",
  {
    id: id("val"),
    agencyId: agencyId(),
    contactId: text().references(() => contacts.id, { onDelete: "set null" }),
    leadId: text().references(() => leads.id, { onDelete: "set null" }),
    agentId: text().references(() => agents.id, { onDelete: "set null" }),
    token: text()
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    street: text().notNull(),
    houseNumber: text(),
    postcode: text().notNull(),
    city: text().notNull(),
    answers: jsonb().$type<ValuationAnswers>().notNull(),
    firstName: text(),
    email: text(),
    phone: text().notNull(),
    language: text().$type<Language>().notNull().default("nl"),
    verificationCode: text().notNull(),
    verificationMethod: text().$type<"whatsapp" | "sms" | "demo">(),
    verifiedAt: timestamp({ withTimezone: true }),
    result: jsonb().$type<ValuationResult>(),
    ...timestamps,
  },
  (t) => [index().on(t.agencyId, t.createdAt)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id("cnv"),
    agencyId: agencyId(),
    contactId: text().references(() => contacts.id, { onDelete: "set null" }),
    leadId: text().references(() => leads.id, { onDelete: "set null" }),
    agentId: text().references(() => agents.id, { onDelete: "set null" }),
    listingId: text().references(() => listings.id, { onDelete: "set null" }),
    channel: text().$type<Channel>().notNull(),
    provider: text().$type<ChannelProvider>(),
    subject: text(),
    // Filled by the planner agent when a message comes in.
    category: text().$type<ConversationCategory>(),
    priority: text().$type<Priority>().notNull().default("normal"),
    summary: text(),
    status: text().$type<"open" | "waiting" | "done">().notNull().default("open"),
    unread: boolean().notNull().default(true),
    externalThreadId: text(),
    lastMessageAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.agencyId, t.lastMessageAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: id("msg"),
    agencyId: agencyId(),
    conversationId: text()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: text().$type<"inbound" | "outbound">().notNull(),
    // Outbound only: "simulated" until the channel is connected, then "sent" or "failed".
    delivery: text().$type<"simulated" | "sent" | "failed">(),
    authorType: text().$type<ActorType>(),
    subject: text(),
    body: text().notNull(),
    // Filled by the AI: e.g. "cancel", "reschedule", "question", "confirm".
    intent: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    // Id at the provider (email Message-ID, WhatsApp message id), for threading, status updates and deduplication.
    externalId: text(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.conversationId, t.sentAt), index().on(t.agencyId, t.externalId)],
);

export type ActorType = "user" | "agent" | "contact" | "system";

/**
 * Append-only log of everything that happens. AI agents subscribe to these
 * events, and the log doubles as their memory and as the activity feed.
 */
export const events = pgTable(
  "events",
  {
    id: id("evt"),
    agencyId: agencyId(),
    type: text().notNull(), // e.g. "lead.created", "appointment.booked"
    subjectType: text().notNull(),
    subjectId: text().notNull(),
    actorType: text().$type<ActorType>().notNull(),
    actorId: text(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.agencyId, t.createdAt), index().on(t.subjectType, t.subjectId)],
);

export type AutomationRule = "reminder" | "follow_up" | "no_show" | "nudge" | "occupant_digest" | "occupant_nudge";

/**
 * One row per thing an automatic job did, so each reminder, follow-up or nudge
 * happens once however often the jobs run. `dueKey` tells repeats apart, e.g.
 * the start time a reminder was for, so a moved viewing gets a new reminder.
 */
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: id("aut"),
    agencyId: agencyId(),
    rule: text().$type<AutomationRule>().notNull(),
    subjectType: text().notNull(),
    subjectId: text().notNull(),
    dueKey: text().notNull(),
    outcome: text().$type<"pending" | "sent" | "drafted" | "skipped" | "failed">().notNull().default("pending"),
    proposalId: text(),
    messageId: text(),
    detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.agencyId, t.rule, t.subjectId, t.dueKey), index().on(t.agencyId, t.createdAt)],
);

export type ProposalStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

/**
 * An action an AI agent wants to take but needs a human to approve, depending on
 * the agency's autonomy settings. Approving runs the named tool with the input.
 */
export const proposals = pgTable(
  "proposals",
  {
    id: id("prp"),
    agencyId: agencyId(),
    agentName: text().notNull(), // which AI agent, e.g. "planner"
    conversationId: text().references(() => conversations.id, { onDelete: "cascade" }),
    kind: text(), // e.g. "reply", "follow_up"
    generatedBy: text().$type<"ai" | "template">(),
    toolName: text().notNull(),
    input: jsonb().$type<Record<string, unknown>>().notNull(),
    summary: text().notNull(), // one line for the inbox
    reasoning: text(),
    subjectType: text(),
    subjectId: text(),
    status: text().$type<ProposalStatus>().notNull().default("pending"),
    decidedBy: text().references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp({ withTimezone: true }),
    result: jsonb().$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index().on(t.agencyId, t.status)],
);
