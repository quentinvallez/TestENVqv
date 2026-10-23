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
    email: text().notNull(),
    phone: text(),
    avatarUrl: text(),
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
    syncState: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: text().$type<"active" | "expired" | "revoked">().notNull().default("active"),
    ...timestamps,
  },
  (t) => [index().on(t.agentId)],
);

export type ListingStatus = "draft" | "active" | "under_offer" | "sold" | "rented" | "archived";

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
    ...timestamps,
  },
  (t) => [index().on(t.agencyId, t.status), uniqueIndex().on(t.agencyId, t.reference)],
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

export type LeadSource = "immoweb" | "zimmo" | "immovlan" | "website" | "whatsapp" | "phone" | "manual";
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
    stage: text().$type<LeadStage>().notNull().default("new"),
    message: text(),
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

export const conversations = pgTable(
  "conversations",
  {
    id: id("cnv"),
    agencyId: agencyId(),
    contactId: text().references(() => contacts.id, { onDelete: "set null" }),
    leadId: text().references(() => leads.id, { onDelete: "set null" }),
    channel: text().$type<Channel>().notNull(),
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
    subject: text(),
    body: text().notNull(),
    // Filled by the AI: e.g. "cancel", "reschedule", "question", "confirm".
    intent: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.conversationId, t.sentAt)],
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
