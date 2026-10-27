import { and, desc, eq, inArray, schema } from "@viewing/db";
import { z } from "zod";
import { draftNoShow, runAutomations } from "../automations/jobs";
import { automationSettings } from "../automations/rules";
import { recordEvent } from "../events";
import { defineTool } from "../tool";

const { agencySettings, appointments, automationRuns, conversations, leads, proposals } = schema;

export const getAutomationSettings = defineTool({
  name: "automations_get_settings",
  description: "Which automatic jobs run for the agency (reminders, follow-ups after viewings, no-show messages, nudges to quiet leads) and whether reminders go out without approval.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const [row] = await ctx.db
      .select({ automations: agencySettings.automations, autonomy: agencySettings.autonomy })
      .from(agencySettings)
      .where(eq(agencySettings.agencyId, ctx.agencyId));
    return {
      ...automationSettings(row?.automations),
      sendRemindersAutomatically: row?.autonomy.reminders === "act",
      sendOccupantAlertsAutomatically: row?.autonomy.occupant_alerts !== "suggest",
    };
  },
});

export const updateAutomationSettings = defineTool({
  name: "automations_update_settings",
  description:
    "Turn automatic jobs on or off, set after how many days a quiet lead gets a nudge, and choose whether reminders and viewing alerts to owners and tenants are sent on their own or wait for approval.",
  mutates: true,
  input: z.object({
    reminders: z.boolean().optional(),
    followUps: z.boolean().optional(),
    noShows: z.boolean().optional(),
    nudges: z.boolean().optional(),
    nudgeAfterDays: z.number().int().min(1).max(14).optional(),
    sendRemindersAutomatically: z.boolean().optional(),
    sendOccupantAlertsAutomatically: z.boolean().optional(),
  }),
  run: async (ctx, input) => {
    const { sendRemindersAutomatically, sendOccupantAlertsAutomatically, ...jobs } = input;
    const [row] = await ctx.db.select().from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
    const automations = { ...row?.automations, ...jobs };
    const level = (on: boolean) => (on ? ("act" as const) : ("suggest" as const));
    const autonomy = {
      ...row?.autonomy,
      ...(sendRemindersAutomatically !== undefined && { reminders: level(sendRemindersAutomatically) }),
      ...(sendOccupantAlertsAutomatically !== undefined && { occupant_alerts: level(sendOccupantAlertsAutomatically) }),
    };
    await ctx.db
      .insert(agencySettings)
      .values({ agencyId: ctx.agencyId, automations, autonomy })
      .onConflictDoUpdate({ target: agencySettings.agencyId, set: { automations, autonomy } });
    await recordEvent(ctx, { type: "settings.automations_updated", subjectType: "agency", subjectId: ctx.agencyId, data: input });
    return {
      ...automationSettings(automations),
      sendRemindersAutomatically: autonomy.reminders === "act",
      sendOccupantAlertsAutomatically: autonomy.occupant_alerts !== "suggest",
    };
  },
});

export const runAutomationsNow = defineTool({
  name: "automations_run",
  description: "Run the automatic jobs for the agency now instead of waiting for the schedule. Each reminder, follow-up and nudge still happens only once.",
  mutates: true,
  input: z.object({}),
  run: async (ctx) => runAutomations(ctx),
});

export const listAutomationRuns = defineTool({
  name: "automations_list_runs",
  description: "What the automatic jobs did recently: reminders sent or drafted, follow-ups, no-show messages and nudges.",
  mutates: false,
  input: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
  run: async (ctx, input) =>
    ctx.db.select().from(automationRuns).where(eq(automationRuns.agencyId, ctx.agencyId)).orderBy(desc(automationRuns.createdAt)).limit(input.limit),
});

export const markAttendance = defineTool({
  name: "appointments_mark_attendance",
  description:
    "After a viewing has started: record whether the client came. A no-show puts the lead back to invited and drafts a message with new times; attended marks it completed so the follow-up is drafted the next day.",
  mutates: true,
  input: z.object({ appointmentId: z.string(), attended: z.boolean(), useAi: z.boolean().default(true) }),
  run: async (ctx, input) => {
    const [apt] = await ctx.db.select().from(appointments).where(and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.id, input.appointmentId)));
    if (!apt) throw new Error("Appointment not found");
    if (apt.startsAt > new Date()) throw new Error("The appointment has not started yet");
    if (apt.status === "cancelled") throw new Error("The appointment was cancelled");
    const status = input.attended ? "completed" : "no_show";
    if (apt.status === status) return { status, proposalId: null, conversationId: null };

    await ctx.db.update(appointments).set({ status }).where(eq(appointments.id, apt.id));
    if (apt.leadId) {
      await ctx.db
        .update(leads)
        .set({ stage: input.attended ? "visited" : "invited" })
        .where(and(eq(leads.agencyId, ctx.agencyId), eq(leads.id, apt.leadId), inArray(leads.stage, input.attended ? ["booked", "invited"] : ["booked", "visited", "follow_up"])));
    }
    await recordEvent(ctx, { type: input.attended ? "appointment.completed" : "appointment.no_show", subjectType: "appointment", subjectId: apt.id, data: {} });
    if (input.attended) return { status, proposalId: null, conversationId: null };

    // A follow-up about a viewing that didn't happen makes no sense any more.
    if (apt.contactId) {
      const theirs = ctx.db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.agencyId, ctx.agencyId), eq(conversations.contactId, apt.contactId)));
      await ctx.db
        .update(proposals)
        .set({ status: "rejected", result: { withdrawn: "Client did not come to the viewing." } })
        .where(and(eq(proposals.agencyId, ctx.agencyId), eq(proposals.status, "pending"), eq(proposals.kind, "follow_up"), inArray(proposals.conversationId, theirs)));
    }
    const { noShows } = await getAutomationSettings.run(ctx, {});
    const draft = noShows ? await draftNoShow(ctx, apt.id, { useAi: input.useAi }) : null;
    return { status, proposalId: draft?.proposalId ?? null, conversationId: draft?.conversationId ?? null };
  },
});
