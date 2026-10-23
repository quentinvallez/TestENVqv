import { and, desc, eq, schema } from "@viewing/db";
import { z } from "zod";
import { recordEvent } from "../events";
import { defineTool } from "../tool";

const { leads, contacts, listings, agents } = schema;

export const leadStages = ["new", "invited", "booked", "visited", "follow_up", "offer", "won", "lost"] as const;

export const listLeads = defineTool({
  name: "leads_list",
  description: "List leads with their contact, listing and responsible agent.",
  mutates: false,
  input: z.object({ stage: z.enum(leadStages).optional() }),
  run: async (ctx, input) => {
    return ctx.db
      .select({
        id: leads.id,
        stage: leads.stage,
        source: leads.source,
        message: leads.message,
        createdAt: leads.createdAt,
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        listingId: listings.id,
        listingReference: listings.reference,
        listingStreet: listings.street,
        listingHouseNumber: listings.houseNumber,
        listingCity: listings.city,
        agentName: agents.name,
        agentColor: agents.color,
      })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .leftJoin(listings, eq(listings.id, leads.listingId))
      .leftJoin(agents, eq(agents.id, leads.agentId))
      .where(and(eq(leads.agencyId, ctx.agencyId), input.stage ? eq(leads.stage, input.stage) : undefined))
      .orderBy(desc(leads.updatedAt));
  },
});

export const moveLeadStage = defineTool({
  name: "leads_move_stage",
  description: "Move a lead to another pipeline stage.",
  mutates: true,
  input: z.object({ leadId: z.string(), stage: z.enum(leadStages) }),
  run: async (ctx, input) => {
    const [before] = await ctx.db
      .select({ stage: leads.stage })
      .from(leads)
      .where(and(eq(leads.agencyId, ctx.agencyId), eq(leads.id, input.leadId)));
    if (!before) throw new Error("Lead not found");
    if (before.stage === input.stage) return { changed: false };

    await ctx.db
      .update(leads)
      .set({ stage: input.stage })
      .where(and(eq(leads.agencyId, ctx.agencyId), eq(leads.id, input.leadId)));
    await recordEvent(ctx, {
      type: "lead.stage_changed",
      subjectType: "lead",
      subjectId: input.leadId,
      data: { from: before.stage, to: input.stage },
    });
    return { changed: true };
  },
});
