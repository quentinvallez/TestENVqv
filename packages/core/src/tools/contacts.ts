import { and, desc, eq, ilike, or, schema, sql } from "@viewing/db";
import { z } from "zod";
import { defineTool } from "../tool";

const { contacts, leads } = schema;

export const listContacts = defineTool({
  name: "contacts_list",
  description: "List the agency's contacts (buyers, tenants, owners), optionally filtered by a search term.",
  mutates: false,
  input: z.object({ search: z.string().optional().describe("Matches name, email or phone") }),
  run: async (ctx, input) => {
    const term = input.search ? `%${input.search}%` : undefined;
    return ctx.db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        language: contacts.language,
        whatsappOptIn: contacts.whatsappOptIn,
        createdAt: contacts.createdAt,
        openLeads: sql<number>`(select count(*)::int from ${leads} where ${leads.contactId} = ${contacts.id} and ${leads.stage} not in ('won','lost'))`,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.agencyId, ctx.agencyId),
          term
            ? or(ilike(contacts.firstName, term), ilike(contacts.lastName, term), ilike(contacts.email, term), ilike(contacts.phone, term))
            : undefined,
        ),
      )
      .orderBy(desc(contacts.createdAt));
  },
});

export type TimelineEntry = {
  at: Date;
  kind: "lead" | "viewing" | "message" | "draft" | "event";
  title: string;
  detail?: string | null;
  direction?: "inbound" | "outbound";
  channel?: string;
  status?: string;
  listingId?: string | null;
  ai?: boolean;
};

export const getContact = defineTool({
  name: "contacts_get",
  description: "A contact with their leads, viewings, conversations, qualification answers and a full chronological history.",
  mutates: false,
  input: z.object({ contactId: z.string() }),
  run: async (ctx, input) => {
    const contact = await ctx.db.query.contacts.findFirst({
      where: and(eq(contacts.agencyId, ctx.agencyId), eq(contacts.id, input.contactId)),
      with: {
        leads: { with: { listing: true, agent: true }, orderBy: desc(leads.updatedAt) },
        appointments: { with: { listing: true, agent: true }, orderBy: desc(schema.appointments.startsAt) },
        conversations: { with: { messages: true, proposals: { where: eq(schema.proposals.status, "pending") } } },
      },
    });
    if (!contact) return null;

    const place = (l: { street: string | null; houseNumber: string | null; city: string | null } | null) =>
      l ? [[l.street, l.houseNumber].filter(Boolean).join(" "), l.city].filter(Boolean).join(", ") : "";
    const timeline: TimelineEntry[] = [
      ...contact.leads.map((lead) => ({
        at: lead.createdAt,
        kind: "lead" as const,
        title: `Interested in ${place(lead.listing)}`,
        detail: lead.message,
        channel: lead.source,
        listingId: lead.listingId,
      })),
      ...contact.appointments.map((apt) => ({
        at: apt.startsAt,
        kind: "viewing" as const,
        title: `Viewing ${place(apt.listing)}`,
        detail: apt.agent ? `with ${apt.agent.name}` : null,
        status: apt.status,
        listingId: apt.listingId,
      })),
      ...contact.conversations.flatMap((conversation) => [
        ...conversation.messages.map((m) => ({
          at: m.sentAt,
          kind: "message" as const,
          title: m.authorType === "system" ? "Changed via booking link" : m.direction === "inbound" ? "Message from client" : "Reply sent",
          detail: m.body,
          direction: m.direction,
          channel: conversation.provider ?? conversation.channel,
          status: m.intent ?? m.delivery ?? undefined,
        })),
        ...conversation.proposals.map((p) => ({
          at: p.createdAt,
          kind: "draft" as const,
          title: p.summary,
          detail: typeof p.input.body === "string" ? p.input.body : null,
          channel: conversation.provider ?? conversation.channel,
          ai: true,
        })),
      ]),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    const qualification = contact.leads.find((l) => l.qualification?.answers.length)?.qualification ?? null;
    return { contact, leads: contact.leads, appointments: contact.appointments, timeline, qualification };
  },
});
