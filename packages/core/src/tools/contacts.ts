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
