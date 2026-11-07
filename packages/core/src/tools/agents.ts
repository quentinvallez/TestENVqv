import { and, asc, eq, schema, sql } from "@viewing/db";
import { z } from "zod";
import { recordEvent } from "../events";
import { defineTool } from "../tool";

const { agents, offices, listings, appointments, calendarConnections } = schema;

export const listAgents = defineTool({
  name: "agents_list",
  description: "List the agency's real estate agents with their office, workload and calendar connection.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    return ctx.db
      .select({
        id: agents.id,
        name: agents.name,
        email: agents.email,
        phone: agents.phone,
        source: agents.source,
        color: agents.color,
        active: agents.active,
        officeName: offices.name,
        activeListings: sql<number>`(select count(*)::int from ${listings} where ${listings.agentId} = ${agents.id} and ${listings.status} in ('active','under_offer'))`,
        upcomingAppointments: sql<number>`(select count(*)::int from ${appointments} where ${appointments.agentId} = ${agents.id} and ${appointments.startsAt} > now() and ${appointments.status} in ('scheduled','confirmed'))`,
        calendarProvider: sql<string | null>`(select ${calendarConnections.provider} from ${calendarConnections} where ${calendarConnections.agentId} = ${agents.id} and ${calendarConnections.status} = 'active' limit 1)`,
      })
      .from(agents)
      .leftJoin(offices, eq(offices.id, agents.officeId))
      .where(and(eq(agents.agencyId, ctx.agencyId)))
      .orderBy(asc(agents.name));
  },
});

const agentFields = {
  name: z.string().trim().min(1).max(120),
  // Any address works, also a personal one (Gmail, Outlook.com, live.be): booking alerts go there.
  email: z.string().trim().toLowerCase().email().max(254).nullable(),
  phone: z.string().trim().max(40).nullable(),
};

async function emailTaken(ctx: Parameters<typeof listAgents.run>[0], email: string | null | undefined, exceptId?: string) {
  if (!email) return false;
  const [other] = await ctx.db.select({ id: agents.id }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.email, email)));
  return Boolean(other && other.id !== exceptId);
}

export const createAgent = defineTool({
  name: "agents_create",
  description: "Add an agent to the agency, with the email address where they get booking alerts (any address, also a personal one).",
  mutates: true,
  input: z.object({ name: agentFields.name, email: agentFields.email.optional(), phone: agentFields.phone.optional() }),
  run: async (ctx, input) => {
    if (await emailTaken(ctx, input.email)) throw new Error("Another agent already uses this email address");
    const [agent] = await ctx.db
      .insert(agents)
      .values({ agencyId: ctx.agencyId, name: input.name, email: input.email ?? null, phone: input.phone ?? null })
      .returning();
    await recordEvent(ctx, { type: "agent.created", subjectType: "agent", subjectId: agent!.id, data: { name: input.name, email: input.email ?? null } });
    return agent!;
  },
});

export const updateAgent = defineTool({
  name: "agents_update",
  description: "Change an agent's name, email address (where booking alerts go; any address, also a personal one) or phone number.",
  mutates: true,
  input: z.object({ agentId: z.string(), name: agentFields.name.optional(), email: agentFields.email.optional(), phone: agentFields.phone.optional() }),
  run: async (ctx, input) => {
    const { agentId, ...changes } = input;
    const [agent] = await ctx.db.select().from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, agentId)));
    if (!agent) throw new Error("Agent not found");
    if (await emailTaken(ctx, changes.email, agent.id)) throw new Error("Another agent already uses this email address");
    const set = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    if (Object.keys(set).length === 0) return agent;
    const [updated] = await ctx.db.update(agents).set(set).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, agent.id))).returning();
    await recordEvent(ctx, { type: "agent.updated", subjectType: "agent", subjectId: agent.id, data: set });
    return updated!;
  },
});
