import { and, asc, eq, schema, sql } from "@viewing/db";
import { z } from "zod";
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
