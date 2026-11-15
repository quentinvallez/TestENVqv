import { and, eq, gte, inArray, isNull, lt, notInArray, or, schema, sql } from "@viewing/db";
import { z } from "zod";
import { automationSettings } from "../automations/rules";
import { recordEvent } from "../events";
import { absoluteUrl } from "../planner/agent";
import { defineTool, runTool, type ToolContext } from "../tool";
import { cancelAppointment } from "./booking";

/*
 * GDPR: the agency is the controller of its clients' data, we are its processor.
 * A client can ask for a copy of their data (export) or to be forgotten (erase),
 * and clients nobody has heard from in a while are erased on their own
 * (`automations.retentionMonths`). Erasing deletes the contact, their leads,
 * conversations, messages, drafts and valuations; past viewings stay for the
 * agent's own records, without anything that points to the person.
 */

const { appointments, automationRuns, contacts, conversations, events, leads, listingOccupants, listings, messages, proposals, valuations } = schema;

const DAY = 24 * 3600 * 1000;
/** A valuation whose phone was never verified is a half-filled form; it goes after this long. */
export const UNVERIFIED_VALUATION_DAYS = 30;
/** Leads in these stages are part of a deal, which the agency may have to keep (anti-money-laundering rules); never erased on their own. */
const DEAL_STAGES = ["offer", "won"] as const;

async function contactOf(ctx: ToolContext, contactId: string) {
  const [contact] = await ctx.db.select().from(contacts).where(and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.id, contactId)));
  if (!contact) throw new Error("Contact not found");
  return contact;
}

export const exportContact = defineTool({
  name: "contacts_export",
  description: "Everything the agency holds about one client (contact details, leads, viewings, valuations, messages), as data to hand over when the client asks for a copy (GDPR access request).",
  mutates: false,
  input: z.object({ contactId: z.string() }),
  run: async (ctx, input) => {
    const contact = await contactOf(ctx, input.contactId);
    const agency = await ctx.db.query.organization.findFirst({ where: eq(schema.organization.id, ctx.agencyId), columns: { name: true } });
    const place = { street: listings.street, houseNumber: listings.houseNumber, postcode: listings.postcode, city: listings.city, reference: listings.reference };
    const [leadRows, appointmentRows, valuationRows, conversationRows, occupantRows] = await Promise.all([
      ctx.db
        .select({ lead: leads, listing: place })
        .from(leads)
        .leftJoin(listings, eq(listings.id, leads.listingId))
        .where(and(eq(leads.agencyId, ctx.agencyId), eq(leads.contactId, contact.id))),
      ctx.db
        .select({ appointment: appointments, listing: place })
        .from(appointments)
        .leftJoin(listings, eq(listings.id, appointments.listingId))
        .where(and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.contactId, contact.id))),
      ctx.db.select().from(valuations).where(and(eq(valuations.agencyId, ctx.agencyId), eq(valuations.contactId, contact.id))),
      ctx.db.query.conversations.findMany({
        where: and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.contactId, contact.id)),
        with: { messages: true },
      }),
      ctx.db
        .select({ role: listingOccupants.role, listing: place })
        .from(listingOccupants)
        .innerJoin(listings, eq(listings.id, listingOccupants.listingId))
        .where(and(eq(listingOccupants.agencyId, ctx.agencyId), eq(listingOccupants.contactId, contact.id))),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      controller: agency?.name ?? null,
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        language: contact.language,
        whatsappOptIn: contact.whatsappOptIn,
        notes: contact.notes,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
      },
      interests: leadRows.map(({ lead, listing }) => ({
        listing,
        source: lead.source,
        intent: lead.intent,
        stage: lead.stage,
        message: lead.message,
        answers: lead.qualification?.answers.map((a) => ({ question: a.question, answer: a.answer })) ?? [],
        createdAt: lead.createdAt,
      })),
      appointments: appointmentRows.map(({ appointment, listing }) => ({
        type: appointment.type,
        status: appointment.status,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        listing,
        location: appointment.location,
        notes: appointment.notes,
      })),
      valuations: valuationRows.map((v) => ({
        address: { street: v.street, houseNumber: v.houseNumber, postcode: v.postcode, city: v.city },
        answers: v.answers,
        firstName: v.firstName,
        email: v.email,
        phone: v.phone,
        verifiedAt: v.verifiedAt,
        estimate: v.result ? { low: v.result.low, high: v.result.high } : null,
        createdAt: v.createdAt,
      })),
      homes: occupantRows.map((o) => ({ role: o.role, listing: o.listing })),
      messages: conversationRows.flatMap((c) =>
        c.messages
          .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
          .map((m) => ({ channel: c.channel, direction: m.direction, subject: m.subject, body: m.body, sentAt: m.sentAt })),
      ),
    };
  },
});

/** Deletes a client and everything that names them; returns what went. Upcoming viewings are cancelled first. */
async function erase(ctx: ToolContext, contactId: string, reason: "request" | "retention") {
  const contact = await contactOf(ctx, contactId);
  const upcoming = await ctx.db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.agencyId, ctx.agencyId),
        eq(appointments.contactId, contact.id),
        inArray(appointments.status, ["scheduled", "confirmed"]),
        gte(appointments.endsAt, new Date()),
      ),
    );
  // Frees the agent's time and removes the event (with the client's name) from their calendar; occupants hear it's off.
  for (const apt of upcoming) await runTool(cancelAppointment, ctx, { appointmentId: apt.id, reason: "Client data erased" });

  return ctx.db.transaction(async (tx) => {
    const scope = (ids: string[]) => (ids.length ? ids : ["-"]);
    const leadIds = (await tx.select({ id: leads.id }).from(leads).where(and(eq(leads.agencyId, ctx.agencyId), eq(leads.contactId, contact.id)))).map((r) => r.id);
    const conversationIds = (
      await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.contactId, contact.id)))
    ).map((r) => r.id);
    const valuationIds = (
      await tx
        .select({ id: valuations.id })
        .from(valuations)
        .where(and(eq(valuations.agencyId, ctx.agencyId), or(eq(valuations.contactId, contact.id), inArray(valuations.leadId, scope(leadIds)))))
    ).map((r) => r.id);
    const appointmentIds = (
      await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.contactId, contact.id)))
    ).map((r) => r.id);
    const subjects = [contact.id, ...leadIds, ...conversationIds, ...valuationIds, ...appointmentIds];

    // Drafts quote the client; messages go with their conversations.
    await tx
      .delete(proposals)
      .where(and(eq(proposals.agencyId, ctx.agencyId), or(inArray(proposals.conversationId, scope(conversationIds)), inArray(proposals.subjectId, subjects))));
    const deletedMessages = conversationIds.length
      ? (await tx.select({ n: sql<number>`count(*)::int` }).from(messages).where(inArray(messages.conversationId, conversationIds)))[0]?.n ?? 0
      : 0;
    await tx.delete(conversations).where(and(eq(conversations.agencyId, ctx.agencyId), inArray(conversations.id, scope(conversationIds))));
    await tx.delete(valuations).where(and(eq(valuations.agencyId, ctx.agencyId), inArray(valuations.id, scope(valuationIds))));
    // Past viewings stay in the agent's agenda and statistics, with nothing that points to the person.
    await tx
      .update(appointments)
      .set({ contactId: null, leadId: null, notes: null })
      .where(and(eq(appointments.agencyId, ctx.agencyId), inArray(appointments.id, scope(appointmentIds))));
    // The activity log and job records keep that something happened, not who or what was said.
    await tx
      .update(events)
      .set({ data: {} })
      .where(and(eq(events.agencyId, ctx.agencyId), or(inArray(events.subjectId, subjects), sql`${events.data}->>'contactId' = ${contact.id}`)));
    await tx.update(automationRuns).set({ detail: {} }).where(and(eq(automationRuns.agencyId, ctx.agencyId), inArray(automationRuns.subjectId, subjects)));
    // Leads and the owner/tenant roles go with the contact (cascade).
    await tx.delete(contacts).where(and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.id, contact.id)));

    const counts = {
      leads: leadIds.length,
      conversations: conversationIds.length,
      messages: deletedMessages,
      valuations: valuationIds.length,
      appointmentsKeptAnonymous: appointmentIds.length,
      upcomingCancelled: upcoming.length,
    };
    // The proof of erasure names no one.
    await recordEvent({ ...ctx, db: tx }, { type: "contact.erased", subjectType: "contact", subjectId: contact.id, data: { reason, ...counts } });
    return counts;
  });
}

export const eraseContact = defineTool({
  name: "contacts_erase",
  description:
    "Forget a client for good when they ask (GDPR erasure): cancels their upcoming viewings, deletes their contact details, interests, messages, drafts and valuations, and keeps past viewings without their name. Cannot be undone.",
  mutates: true,
  input: z.object({ contactId: z.string() }),
  run: async (ctx, input) => erase(ctx, input.contactId, "request"),
});

/**
 * Clients the agency hasn't been in touch with for `months`: nothing new on the contact, no lead, viewing or message
 * since. Owners and tenants of a listing and clients in a deal (offer, won) are kept.
 */
export async function inactiveContacts(ctx: ToolContext, months: number, now: Date, limit = 200) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  const rows = await ctx.db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.agencyId, ctx.agencyId),
        lt(contacts.updatedAt, cutoff),
        notInArray(contacts.id, ctx.db.select({ id: listingOccupants.contactId }).from(listingOccupants).where(eq(listingOccupants.agencyId, ctx.agencyId))),
        sql`not exists (select 1 from ${leads} where ${leads.contactId} = ${contacts.id} and (${leads.updatedAt} >= ${cutoff} or ${leads.stage} in ${DEAL_STAGES}))`,
        sql`not exists (select 1 from ${appointments} where ${appointments.contactId} = ${contacts.id} and ${appointments.endsAt} >= ${cutoff})`,
        sql`not exists (select 1 from ${conversations} where ${conversations.contactId} = ${contacts.id} and ${conversations.lastMessageAt} >= ${cutoff})`,
      ),
    )
    .limit(limit);
  return rows.map((r) => r.id);
}

/** The retention job: erases inactive clients and half-filled valuations. Part of the automatic jobs. */
export async function applyRetention(ctx: ToolContext, now = new Date()) {
  const [row] = await ctx.db.select({ automations: schema.agencySettings.automations }).from(schema.agencySettings).where(eq(schema.agencySettings.agencyId, ctx.agencyId));
  const { retentionMonths } = automationSettings(row?.automations);
  const unverified = await ctx.db
    .delete(valuations)
    .where(and(eq(valuations.agencyId, ctx.agencyId), isNull(valuations.verifiedAt), lt(valuations.createdAt, new Date(now.getTime() - UNVERIFIED_VALUATION_DAYS * DAY))))
    .returning({ id: valuations.id });
  let erased = 0;
  if (retentionMonths > 0) {
    for (const id of await inactiveContacts(ctx, retentionMonths, now)) {
      try {
        await erase(ctx, id, "retention");
        erased++;
      } catch (error) {
        console.error(`Retention erase failed for ${id}`, error);
      }
    }
  }
  return { erased, unverifiedValuations: unverified.length };
}

export const previewRetention = defineTool({
  name: "privacy_preview_retention",
  description: "How many clients the retention rule would erase now, the current setting (months without contact; 0 = never) and the link to the agency's privacy notice for clients.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const [row] = await ctx.db.select({ automations: schema.agencySettings.automations }).from(schema.agencySettings).where(eq(schema.agencySettings.agencyId, ctx.agencyId));
    const { retentionMonths } = automationSettings(row?.automations);
    const due = retentionMonths > 0 ? (await inactiveContacts(ctx, retentionMonths, new Date(), 1000)).length : 0;
    return { retentionMonths, due, privacyUrl: absoluteUrl(`/privacy/${ctx.agencyId}`) };
  },
});
