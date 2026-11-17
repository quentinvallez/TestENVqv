import { and, desc, eq, isNull, schema, sql } from "@viewing/db";
import { z } from "zod";
import { emailAgent } from "../channels";
import { oauthConfigured } from "../integrations/oauth";
import { recordEvent } from "../events";
import { absoluteUrl } from "../planner/agent";
import { type Lang, toLang } from "../planner/language";
import { defineTool, type ToolContext } from "../tool";

/*
 * Logins for the agency's agents. Better Auth keeps the logins themselves
 * (member, invitation); these tools read them per agency, send the invitation
 * email and tie a login to its agent record, matched by email address.
 */

const { agents, calendarConnections, member, invitation, user } = schema;

export type TeamRole = "owner" | "admin" | "member";
export type AgentLogin =
  | { status: "member"; role: TeamRole; userId: string; memberId: string }
  | { status: "invited"; invitationId: string; invitedAt: Date; expiresAt: Date; expired: boolean }
  | { status: "none" };

/** Each agent's login: signed up (with role), invited, or nothing yet. */
export async function agentLogins(ctx: ToolContext): Promise<Map<string, AgentLogin>> {
  const team = await ctx.db.select({ id: agents.id, email: agents.email, userId: agents.userId }).from(agents).where(eq(agents.agencyId, ctx.agencyId));
  const members = await ctx.db
    .select({ memberId: member.id, userId: member.userId, role: member.role, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, ctx.agencyId));
  const invites = await ctx.db
    .select()
    .from(invitation)
    .where(and(eq(invitation.organizationId, ctx.agencyId), eq(invitation.status, "pending")))
    .orderBy(desc(invitation.createdAt));
  const now = Date.now();
  const logins = new Map<string, AgentLogin>();
  for (const agent of team) {
    const email = agent.email?.toLowerCase() ?? null;
    const login = members.find((m) => m.userId === agent.userId) ?? (email ? members.find((m) => m.email.toLowerCase() === email) : undefined);
    if (login) {
      logins.set(agent.id, { status: "member", role: login.role as TeamRole, userId: login.userId, memberId: login.memberId });
      continue;
    }
    const invite = email ? invites.find((i) => i.email.toLowerCase() === email) : undefined;
    logins.set(
      agent.id,
      invite ? { status: "invited", invitationId: invite.id, invitedAt: invite.createdAt, expiresAt: invite.expiresAt, expired: invite.expiresAt.getTime() < now } : { status: "none" },
    );
  }
  return logins;
}

export const getAgentLogin = defineTool({
  name: "team_get_agent_login",
  description: "Whether an agent can log in: signed up (and as admin or agent), invited (with the invitation link), or not yet.",
  mutates: false,
  input: z.object({ agentId: z.string() }),
  run: async (ctx, input) => {
    const [agent] = await ctx.db.select({ id: agents.id, email: agents.email }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, input.agentId)));
    if (!agent) throw new Error("Agent not found");
    const login = (await agentLogins(ctx)).get(agent.id) ?? { status: "none" as const };
    return { email: agent.email, login, link: login.status === "invited" ? absoluteUrl(`/invite/${login.invitationId}`) : null };
  },
});

const subjects: Record<Lang, (agency: string) => string> = {
  nl: (agency) => `Uitnodiging: log in bij ${agency}`,
  fr: (agency) => `Invitation : connectez-vous chez ${agency}`,
  en: (agency) => `Invitation: log in to ${agency}`,
  de: (agency) => `Einladung: Melden Sie sich bei ${agency} an`,
};

const bodies: Record<Lang, (v: { name: string; inviter: string; agency: string; link: string; days: number }) => string> = {
  nl: (v) =>
    `Dag ${v.name},\n\n${v.inviter} nodigt u uit om in te loggen bij ${v.agency}. U ziet er uw bezoeken en koppelt uw eigen Outlook of Gmail, zodat berichten aan klanten van uw eigen adres vertrekken.\n\nAccepteer de uitnodiging: ${v.link}\n\nDe link is ${v.days} dagen geldig.`,
  fr: (v) =>
    `Bonjour ${v.name},\n\n${v.inviter} vous invite à vous connecter chez ${v.agency}. Vous y voyez vos visites et vous connectez votre propre Outlook ou Gmail, pour que les messages aux clients partent de votre propre adresse.\n\nAccepter l'invitation : ${v.link}\n\nLe lien est valable ${v.days} jours.`,
  en: (v) =>
    `Hi ${v.name},\n\n${v.inviter} invites you to log in to ${v.agency}. You'll see your viewings there and connect your own Outlook or Gmail, so messages to clients go out from your own address.\n\nAccept the invitation: ${v.link}\n\nThe link works for ${v.days} days.`,
  de: (v) =>
    `Guten Tag ${v.name},\n\n${v.inviter} lädt Sie ein, sich bei ${v.agency} anzumelden. Dort sehen Sie Ihre Besichtigungen und verbinden Ihr eigenes Outlook oder Gmail, damit Nachrichten an Kunden von Ihrer eigenen Adresse aus versendet werden.\n\nEinladung annehmen: ${v.link}\n\nDer Link ist ${v.days} Tage gültig.`,
};

export const sendInvitationEmail = defineTool({
  name: "team_send_invitation_email",
  description: "Email an agent the link to accept their invitation and set up their login, in the agent's language.",
  mutates: true,
  input: z.object({ invitationId: z.string(), inviterName: z.string().optional() }),
  run: async (ctx, input) => {
    const [invite] = await ctx.db.select().from(invitation).where(and(eq(invitation.organizationId, ctx.agencyId), eq(invitation.id, input.invitationId)));
    if (!invite) throw new Error("Invitation not found");
    const [agent] = await ctx.db
      .select()
      .from(agents)
      .where(and(eq(agents.agencyId, ctx.agencyId), sql`lower(${agents.email}) = ${invite.email.toLowerCase()}`));
    const agency = await ctx.db.query.organization.findFirst({ where: eq(schema.organization.id, ctx.agencyId), columns: { name: true } });
    const lang = toLang(agent?.languages[0]);
    const link = absoluteUrl(`/invite/${invite.id}`);
    const days = Math.max(1, Math.round((invite.expiresAt.getTime() - Date.now()) / 86_400_000));
    const text = bodies[lang]({ name: agent?.name.split(" ")[0] ?? "", inviter: input.inviterName ?? agency?.name ?? "", agency: agency?.name ?? "", link, days });
    const sent = await emailAgent(ctx, { agentId: agent?.id ?? null, to: invite.email, subject: subjects[lang](agency?.name ?? ""), text });
    await recordEvent(ctx, { type: "team.invited", subjectType: "agent", subjectId: agent?.id ?? invite.id, data: { invitationId: invite.id, delivery: sent.delivery } });
    return { link, delivery: sent.delivery, error: sent.error ?? null };
  },
});

export const linkAgentLogin = defineTool({
  name: "team_link_agent_login",
  description: "Tie a login that just joined the agency to the agent with the same email address.",
  mutates: true,
  input: z.object({ userId: z.string(), email: z.string() }),
  run: async (ctx, input) => {
    const [agent] = await ctx.db
      .update(agents)
      .set({ userId: input.userId })
      .where(and(eq(agents.agencyId, ctx.agencyId), isNull(agents.userId), sql`lower(${agents.email}) = ${input.email.toLowerCase()}`))
      .returning({ id: agents.id });
    if (agent) await recordEvent(ctx, { type: "team.joined", subjectType: "agent", subjectId: agent.id, data: { userId: input.userId } });
    return { agentId: agent?.id ?? null };
  },
});

export const unlinkAgentLogin = defineTool({
  name: "team_unlink_agent_login",
  description: "Detach a login from its agent record after the login was removed from the agency. The agent and their viewings stay.",
  mutates: true,
  input: z.object({ agentId: z.string() }),
  run: async (ctx, input) => {
    await ctx.db.update(agents).set({ userId: null }).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.id, input.agentId)));
    await recordEvent(ctx, { type: "team.removed", subjectType: "agent", subjectId: input.agentId, data: {} });
    return { agentId: input.agentId };
  },
});

export const getMyAgent = defineTool({
  name: "team_get_my_agent",
  description: "The agent record of the logged-in user, for their own page (hours, mailbox, viewings).",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    if (ctx.actor.type !== "user" || !ctx.actor.id) return { agentId: null };
    const [agent] = await ctx.db.select({ id: agents.id }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.userId, ctx.actor.id)));
    return { agentId: agent?.id ?? null };
  },
});

const resetSubjects: Record<Lang, string> = {
  nl: "Kies een nieuw wachtwoord",
  fr: "Choisissez un nouveau mot de passe",
  en: "Choose a new password",
  de: "Wählen Sie ein neues Passwort",
};

const resetBodies: Record<Lang, (v: { name: string; agency: string; link: string }) => string> = {
  nl: (v) =>
    `Dag ${v.name},\n\nU vroeg een nieuw wachtwoord aan voor ${v.agency}. Kies het hier: ${v.link}\n\nDe link is 1 uur geldig. Vroeg u dit niet aan? Dan hoeft u niets te doen; uw wachtwoord blijft hetzelfde.`,
  fr: (v) =>
    `Bonjour ${v.name},\n\nVous avez demandé un nouveau mot de passe pour ${v.agency}. Choisissez-le ici : ${v.link}\n\nLe lien est valable 1 heure. Vous n'avez rien demandé ? Ne faites rien ; votre mot de passe reste le même.`,
  en: (v) =>
    `Hi ${v.name},\n\nYou asked for a new password for ${v.agency}. Choose it here: ${v.link}\n\nThe link works for 1 hour. Didn't ask for this? Then do nothing; your password stays the same.`,
  de: (v) =>
    `Guten Tag ${v.name},\n\nSie haben ein neues Passwort für ${v.agency} angefordert. Wählen Sie es hier: ${v.link}\n\nDer Link ist 1 Stunde gültig. Haben Sie das nicht angefordert? Dann müssen Sie nichts tun; Ihr Passwort bleibt gleich.`,
};

export const sendPasswordReset = defineTool({
  name: "team_send_password_reset",
  description: "Email a login of the agency the link to choose a new password, in the agent's language.",
  mutates: true,
  input: z.object({ userId: z.string(), email: z.string(), name: z.string().optional(), link: z.string() }),
  run: async (ctx, input) => {
    const [login] = await ctx.db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, ctx.agencyId), eq(member.userId, input.userId)));
    if (!login) throw new Error("Not a login of this agency");
    const [agent] = await ctx.db
      .select()
      .from(agents)
      .where(and(eq(agents.agencyId, ctx.agencyId), sql`(${agents.userId} = ${input.userId} or lower(${agents.email}) = ${input.email.toLowerCase()})`));
    const agency = await ctx.db.query.organization.findFirst({ where: eq(schema.organization.id, ctx.agencyId), columns: { name: true } });
    const lang = toLang(agent?.languages[0]);
    const name = (agent?.name ?? input.name ?? "").split(" ")[0] ?? "";
    const sent = await emailAgent(ctx, { agentId: agent?.id ?? null, to: input.email, subject: resetSubjects[lang], text: resetBodies[lang]({ name, agency: agency?.name ?? "", link: input.link }) });
    await recordEvent(ctx, { type: "team.password_reset_sent", subjectType: "user", subjectId: input.userId, data: { delivery: sent.delivery } });
    return { delivery: sent.delivery, error: sent.error ?? null };
  },
});


export type MissingConnection = "login" | "mailbox" | "calendar";

export const listTeamNotConnected = defineTool({
  name: "team_list_not_connected",
  description:
    "Active agents who aren't fully set up: no login yet (never invited, or invited and not accepted), no working Outlook/Gmail for sending client emails, or no connected calendar. Each agent comes with what is missing.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const team = await ctx.db.select({ id: agents.id, name: agents.name, color: agents.color }).from(agents).where(and(eq(agents.agencyId, ctx.agencyId), eq(agents.active, true))).orderBy(agents.name);
    const [logins, connections] = await Promise.all([
      agentLogins(ctx),
      ctx.db
        .select({ agentId: calendarConnections.agentId, scopes: calendarConnections.scopes, status: calendarConnections.status })
        .from(calendarConnections)
        .where(eq(calendarConnections.agencyId, ctx.agencyId)),
    ]);
    const canConnect = oauthConfigured("google") || oauthConfigured("microsoft");
    const notConnected = team
      .map((agent) => {
        const login = logins.get(agent.id) ?? { status: "none" as const };
        const mine = connections.filter((c) => c.agentId === agent.id && c.status === "active");
        const missing: MissingConnection[] = [];
        if (login.status !== "member") missing.push("login");
        if (canConnect && !mine.some((c) => c.scopes.includes("mail"))) missing.push("mailbox");
        if (canConnect && !mine.some((c) => c.scopes.includes("calendar"))) missing.push("calendar");
        return missing.length ? { agentId: agent.id, name: agent.name, color: agent.color, invited: login.status === "invited", missing } : null;
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
    return { agents: notConnected, total: team.length };
  },
});
