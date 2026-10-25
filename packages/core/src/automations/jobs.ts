import type { AutomationRule } from "@viewing/db/schema";
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, schema, db, type Database } from "@viewing/db";
import { conversationFor, sendMessage } from "../channels";
import { recordEvent } from "../events";
import { absoluteUrl, addressOf, draftFollowUp, loadThread, pickSpreadSlots, propose, type DraftPlan } from "../planner/agent";
import { composeMessage, detailLabels, formatSlot, linkLabels, reminderSubject, signature, templates, toLang } from "../planner/language";
import { availableSlots } from "../tools/booking";
import { startOfZonedDay } from "../time";
import { runTool, type ToolContext } from "../tool";
import { automationSettings, completionDue, followUpDue, LOOKBACK, nudgeDue, REMINDER_MIN_NOTICE, reminderDue } from "./rules";

const { appointments, automationRuns, agencySettings, conversations, leads, messages, organization, proposals } = schema;

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** Takes the job for this subject, or returns null when an earlier or parallel run already did it. */
async function claim(ctx: ToolContext, rule: AutomationRule, subjectType: string, subjectId: string, dueKey: string) {
  const [row] = await ctx.db
    .insert(automationRuns)
    .values({ agencyId: ctx.agencyId, rule, subjectType, subjectId, dueKey })
    .onConflictDoNothing()
    .returning({ id: automationRuns.id });
  return row?.id ?? null;
}

async function finish(
  ctx: ToolContext,
  runId: string,
  result: { outcome: "sent" | "drafted" | "skipped" | "failed"; proposalId?: string | null; messageId?: string | null; detail?: Record<string, unknown> },
) {
  await ctx.db
    .update(automationRuns)
    .set({ outcome: result.outcome, proposalId: result.proposalId ?? null, messageId: result.messageId ?? null, detail: result.detail ?? {} })
    .where(eq(automationRuns.id, runId));
}

/** Runs one job and records how it ended; a failure is logged and not retried, so a broken message is never sent twice. */
async function attempt(ctx: ToolContext, runId: string, job: () => Promise<Parameters<typeof finish>[2]>) {
  try {
    const result = await job();
    await finish(ctx, runId, result);
    return result.outcome;
  } catch (error) {
    console.error("Automation failed", error);
    await finish(ctx, runId, { outcome: "failed", detail: { error: error instanceof Error ? error.message : String(error) } });
    return "failed" as const;
  }
}

async function loadSettings(ctx: ToolContext) {
  const [row] = await ctx.db
    .select({ automations: agencySettings.automations, autonomy: agencySettings.autonomy })
    .from(agencySettings)
    .where(eq(agencySettings.agencyId, ctx.agencyId));
  return { ...automationSettings(row?.automations), sendRemindersAutomatically: row?.autonomy.reminders === "act" };
}

const automationsCtx = (ctx: ToolContext): ToolContext => ({ ...ctx, actor: { type: "agent", id: "automations" } });

// ---------------------------------------------------------------- reminders

/** A reminder that is still waiting for approval is withdrawn when its viewing was cancelled, moved or has passed. */
async function withdrawStaleReminders(ctx: ToolContext, now: Date) {
  const pending = await ctx.db
    .select({ id: proposals.id, appointmentId: proposals.subjectId, input: proposals.input })
    .from(proposals)
    .where(and(eq(proposals.agencyId, ctx.agencyId), eq(proposals.status, "pending"), eq(proposals.kind, "reminder")));
  if (pending.length === 0) return 0;
  const ids = pending.map((p) => p.appointmentId).filter((id): id is string => !!id);
  const current = new Map(
    (await ctx.db.select().from(appointments).where(and(eq(appointments.agencyId, ctx.agencyId), inArray(appointments.id, ids)))).map((a) => [a.id, a]),
  );
  const stale = pending.filter((p) => {
    const apt = p.appointmentId ? current.get(p.appointmentId) : undefined;
    const meta = p.input.metadata as { startsAt?: string } | undefined;
    return !apt || (apt.status !== "scheduled" && apt.status !== "confirmed") || apt.startsAt.toISOString() !== meta?.startsAt || apt.startsAt <= now;
  });
  if (stale.length === 0) return 0;
  await ctx.db
    .update(proposals)
    .set({ status: "rejected", result: { withdrawn: "The viewing was cancelled, moved or has passed." } })
    .where(and(eq(proposals.agencyId, ctx.agencyId), inArray(proposals.id, stale.map((p) => p.id))));
  return stale.length;
}

async function sendReminders(ctx: ToolContext, now: Date, autoSend: boolean) {
  const candidates = await ctx.db.query.appointments.findMany({
    where: and(
      eq(appointments.agencyId, ctx.agencyId),
      inArray(appointments.status, ["scheduled", "confirmed"]),
      inArray(appointments.type, ["viewing", "valuation"]),
      isNotNull(appointments.contactId),
      gte(appointments.startsAt, new Date(now.getTime() + REMINDER_MIN_NOTICE)),
      lt(appointments.startsAt, new Date(now.getTime() + 2 * DAY)),
    ),
    with: { contact: true, listing: true, agent: true },
    orderBy: asc(appointments.startsAt),
  });
  const [agency] = await ctx.db.select({ name: organization.name }).from(organization).where(eq(organization.id, ctx.agencyId));
  const outcomes: string[] = [];

  for (const apt of candidates) {
    if (!apt.contact || !reminderDue(apt, now)) continue;
    const runId = await claim(ctx, "reminder", "appointment", apt.id, apt.startsAt.toISOString());
    if (!runId) continue;
    const contact = apt.contact;
    outcomes.push(
      await attempt(ctx, runId, async () => {
        const lang = toLang(contact.language);
        const place = addressOf(apt.listing) || apt.location || "";
        const agentName = apt.agent?.name ?? agency?.name ?? "";
        const conversation = await conversationFor(ctx, {
          contactId: contact.id,
          listingId: apt.listingId,
          agentId: apt.agentId,
          leadId: apt.leadId,
          subject: reminderSubject[lang],
        });
        const isValuation = apt.type === "valuation";
        const body = composeMessage({
          lang,
          body: templates[isValuation ? "valuation_reminder" : "reminder"]![lang]({ name: contact.firstName ?? "", address: place, agentName }),
          details: [
            { label: detailLabels.when[lang], value: formatSlot(apt.startsAt, lang) },
            { label: detailLabels.where[lang], value: apt.location ?? place },
            { label: detailLabels.with[lang], value: agentName },
          ],
          link: { url: absoluteUrl(`/a/${apt.manageToken}`), label: linkLabels.change[lang] },
          signature: signature(lang, agentName, agency?.name ?? "", conversation.channel),
        });
        const whatsappTemplate = { name: "viewing_reminder", language: lang, params: [contact.firstName ?? "", place, formatSlot(apt.startsAt, lang), agentName] };
        const metadata = { appointmentId: apt.id, startsAt: apt.startsAt.toISOString() };

        if (autoSend) {
          const sent = await sendMessage(ctx, { conversationId: conversation.id, body, subject: reminderSubject[lang], kind: "reminder", whatsappTemplate, metadata });
          await recordEvent(ctx, { type: "automation.reminder_sent", subjectType: "appointment", subjectId: apt.id, data: { delivery: sent.delivery } });
          return { outcome: sent.delivery === "failed" ? "failed" : "sent", messageId: sent.messageId, detail: { delivery: sent.delivery, error: sent.error } };
        }
        // Waits in the inbox next to any other draft for this client; nothing is replaced.
        const [proposal] = await ctx.db
          .insert(proposals)
          .values({
            agencyId: ctx.agencyId,
            agentName: "planner",
            conversationId: conversation.id,
            kind: "reminder",
            generatedBy: "template",
            toolName: "conversations_reply",
            input: { conversationId: conversation.id, body, kind: "reminder", whatsappTemplate, metadata },
            summary: `Remind ${contact.firstName ?? "the client"} of the ${isValuation ? "valuation visit" : "viewing"} ${formatSlot(apt.startsAt, "en")}`,
            reasoning: "Reminder the day before. Reminders wait for approval unless Settings → Automations sends them automatically.",
            subjectType: "appointment",
            subjectId: apt.id,
          })
          .returning();
        await recordEvent(ctx, { type: "automation.reminder_drafted", subjectType: "appointment", subjectId: apt.id, data: { proposalId: proposal!.id } });
        return { outcome: "drafted", proposalId: proposal!.id };
      }),
    );
  }
  return outcomes;
}

// ---------------------------------------------------------------- after the viewing

/** Viewings nobody marked are taken as completed; the lead moves from booked to visited. */
async function completeViewings(ctx: ToolContext, now: Date) {
  const open = await ctx.db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.agencyId, ctx.agencyId),
        inArray(appointments.status, ["scheduled", "confirmed"]),
        gte(appointments.endsAt, new Date(now.getTime() - LOOKBACK)),
        lte(appointments.endsAt, now),
      ),
    );
  let completed = 0;
  for (const apt of open) {
    if (!completionDue(apt, now)) continue;
    const [updated] = await ctx.db
      .update(appointments)
      .set({ status: "completed" })
      .where(and(eq(appointments.id, apt.id), inArray(appointments.status, ["scheduled", "confirmed"])))
      .returning({ id: appointments.id });
    if (!updated) continue;
    if (apt.leadId) {
      await ctx.db.update(leads).set({ stage: "visited" }).where(and(eq(leads.agencyId, ctx.agencyId), eq(leads.id, apt.leadId), eq(leads.stage, "booked")));
    }
    await recordEvent(ctx, { type: "appointment.completed", subjectType: "appointment", subjectId: apt.id, data: { automatic: true } });
    completed++;
  }
  return completed;
}

async function contactHasPendingDraft(ctx: ToolContext, contactId: string) {
  const [row] = await ctx.db
    .select({ id: proposals.id })
    .from(proposals)
    .innerJoin(conversations, eq(conversations.id, proposals.conversationId))
    .where(and(eq(proposals.agencyId, ctx.agencyId), eq(proposals.status, "pending"), or(isNull(proposals.kind), ne(proposals.kind, "reminder")), eq(conversations.contactId, contactId)))
    .limit(1);
  return !!row;
}

async function lastOutboundTo(ctx: ToolContext, contactId: string) {
  const [row] = await ctx.db
    .select({ sentAt: messages.sentAt })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(messages.agencyId, ctx.agencyId), eq(conversations.contactId, contactId), eq(messages.direction, "outbound")))
    .orderBy(desc(messages.sentAt))
    .limit(1);
  return row?.sentAt ?? null;
}

async function draftFollowUps(ctx: ToolContext, now: Date, useAi: boolean) {
  const done = await ctx.db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.agencyId, ctx.agencyId),
        eq(appointments.status, "completed"),
        eq(appointments.type, "viewing"),
        isNotNull(appointments.contactId),
        gte(appointments.endsAt, new Date(now.getTime() - LOOKBACK)),
        lt(appointments.endsAt, startOfZonedDay(now)),
      ),
    );
  const outcomes: string[] = [];
  for (const apt of done) {
    const lastOutboundAt = await lastOutboundTo(ctx, apt.contactId!);
    if (!followUpDue({ ...apt, lastOutboundAt }, now)) continue;
    if (await contactHasPendingDraft(ctx, apt.contactId!)) continue;
    const runId = await claim(ctx, "follow_up", "appointment", apt.id, "after_viewing");
    if (!runId) continue;
    outcomes.push(
      await attempt(ctx, runId, async () => {
        const { proposalId } = await draftFollowUp({ ...ctx, actor: { type: "agent", id: "planner" } }, apt.id, { useAi });
        await recordEvent(ctx, { type: "automation.follow_up_drafted", subjectType: "appointment", subjectId: apt.id, data: { proposalId } });
        return { outcome: "drafted", proposalId };
      }),
    );
  }
  return outcomes;
}

/** After an agent marks a no-show: a draft that offers new times, in the client's conversation. */
export async function draftNoShow(ctx: ToolContext, appointmentId: string, options: { useAi?: boolean } = {}) {
  const apt = await ctx.db.query.appointments.findFirst({ where: and(eq(appointments.agencyId, ctx.agencyId), eq(appointments.id, appointmentId)) });
  if (!apt?.contactId) return null;
  const runId = await claim(ctx, "no_show", "appointment", apt.id, apt.startsAt.toISOString());
  if (!runId) return null;
  let result = null as { proposalId: string; conversationId: string } | null;
  await attempt(ctx, runId, async () => {
    const conversation = await conversationFor(ctx, { contactId: apt.contactId!, listingId: apt.listingId, agentId: apt.agentId, leadId: apt.leadId });
    // The thread shows what happened, like the notes for bookings and cancellations through the link.
    const [note] = await ctx.db
      .insert(messages)
      .values({
        agencyId: ctx.agencyId,
        conversationId: conversation.id,
        direction: "inbound",
        authorType: "system",
        body: `Didn't show up for the viewing on ${formatSlot(apt.startsAt, "en")}.`,
        intent: "cancellation",
        metadata: { kind: "no_show" },
      })
      .returning();
    await ctx.db
      .update(conversations)
      .set({ category: "cancellation", summary: "Didn't come to the viewing.", status: "open", lastMessageAt: note!.sentAt, listingId: apt.listingId ?? conversation.listingId })
      .where(eq(conversations.id, conversation.id));
    const thread = await loadThread(ctx, conversation.id);
    if (apt.listingId && thread.listing?.id !== apt.listingId) {
      thread.listing = (await ctx.db.query.listings.findFirst({ where: and(eq(schema.listings.agencyId, ctx.agencyId), eq(schema.listings.id, apt.listingId)) })) ?? thread.listing;
    }
    const lang = toLang(thread.contact?.language);
    const { slots } = await runTool(availableSlots, ctx, { agentId: apt.agentId, days: 10 });
    const name = thread.contact?.firstName ?? "the client";
    const plan: DraftPlan = {
      kind: "no_show",
      messageKind: "no_show",
      purpose: `The client did not come to the viewing on ${formatSlot(apt.startsAt, "en")}. Say kindly, without any reproach, that we missed them and that things come up, and offer the times below in case they still want to see the property.`,
      templateKey: "no_show",
      slots: pickSpreadSlots(slots),
      link: apt.listingId ? { url: `/book/${apt.listingId}`, label: linkLabels.book[lang] } : undefined,
      leadStage: "invited",
      summary: `Offer ${name} new times after the missed viewing`,
    };
    const proposal = await propose({ ...ctx, actor: { type: "agent", id: "planner" } }, thread, plan, lang, "Marked as a no-show by the agent.", options.useAi ?? true);
    result = { proposalId: proposal.id, conversationId: conversation.id };
    return { outcome: "drafted", proposalId: proposal.id };
  });
  return result;
}

// ---------------------------------------------------------------- nudges

async function draftNudges(ctx: ToolContext, now: Date, afterDays: number, useAi: boolean) {
  const waiting = await ctx.db.query.conversations.findMany({
    where: and(
      eq(conversations.agencyId, ctx.agencyId),
      eq(conversations.status, "waiting"),
      isNotNull(conversations.contactId),
      lte(conversations.lastMessageAt, new Date(now.getTime() - afterDays * DAY)),
      gte(conversations.lastMessageAt, new Date(now.getTime() - LOOKBACK - afterDays * DAY)),
    ),
    with: {
      messages: { orderBy: desc(messages.sentAt), limit: 1 },
      proposals: { where: eq(proposals.status, "pending"), columns: { id: true } },
    },
  });
  const outcomes: string[] = [];
  for (const conversation of waiting) {
    const last = conversation.messages[0] ?? null;
    if (!last || (last.metadata as { kind?: string }).kind === "reminder") continue;
    const [lead] = await ctx.db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.agencyId, ctx.agencyId),
          conversation.leadId ? eq(leads.id, conversation.leadId) : eq(leads.contactId, conversation.contactId!),
        ),
      )
      .orderBy(desc(leads.updatedAt))
      .limit(1);
    const [upcoming] = await ctx.db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.agencyId, ctx.agencyId),
          eq(appointments.contactId, conversation.contactId!),
          inArray(appointments.status, ["scheduled", "confirmed"]),
          gt(appointments.startsAt, now),
        ),
      )
      .limit(1);
    const [{ nudges } = { nudges: 0 }] = await ctx.db
      .select({ nudges: count() })
      .from(automationRuns)
      .where(and(eq(automationRuns.agencyId, ctx.agencyId), eq(automationRuns.rule, "nudge"), eq(automationRuns.subjectId, conversation.id)));
    const due = nudgeDue(
      {
        lastMessage: last,
        leadStage: lead?.stage ?? null,
        hasPendingDraft: conversation.proposals.length > 0,
        hasUpcomingAppointment: !!upcoming,
        nudgesSoFar: nudges,
      },
      now,
      afterDays,
    );
    if (!due) continue;
    const runId = await claim(ctx, "nudge", "conversation", conversation.id, last.id);
    if (!runId) continue;
    outcomes.push(
      await attempt(ctx, runId, async () => {
        const plannerCtx: ToolContext = { ...ctx, actor: { type: "agent", id: "planner" } };
        const thread = await loadThread(plannerCtx, conversation.id);
        const lang = toLang(thread.contact?.language);
        const name = thread.contact?.firstName ?? "the client";
        const invite = (lead!.stage === "new" || lead!.stage === "invited") && !!thread.agent && !!thread.listing;
        const slots = invite ? pickSpreadSlots((await runTool(availableSlots, ctx, { agentId: thread.agent!.id, days: 10 })).slots) : [];
        const days = Math.round((now.getTime() - last.sentAt.getTime()) / DAY);
        const plan: DraftPlan = invite
          ? {
              kind: "nudge",
              messageKind: "nudge",
              purpose: `The client has not answered our last message for ${days} days. Write a short, friendly check-in, without pressure: ask whether they are still interested and offer the times below. ${nudges > 0 ? "This is the last check-in, so also say we won't keep writing." : ""}`,
              templateKey: "nudge_invited",
              slots,
              link: { url: `/book/${thread.listing!.id}`, label: linkLabels.book[lang] },
              summary: `Check in with ${name}: no answer for ${days} days`,
            }
          : {
              kind: "nudge",
              messageKind: "nudge",
              purpose: `The client has not answered our last message for ${days} days. Write a short, friendly check-in, without pressure: ask whether they have questions or want to take a next step, and say it is fine to tell us it is not for them. ${nudges > 0 ? "This is the last check-in, so also say we won't keep writing." : ""}`,
              templateKey: "nudge",
              slots: [],
              summary: `Check in with ${name}: no answer for ${days} days`,
            };
        const proposal = await propose(plannerCtx, thread, plan, lang, `No reply for ${days} days after our last message.`, useAi);
        await recordEvent(ctx, { type: "automation.nudge_drafted", subjectType: "conversation", subjectId: conversation.id, data: { proposalId: proposal.id, nudge: nudges + 1 } });
        return { outcome: "drafted", proposalId: proposal.id, detail: { nudge: nudges + 1 } };
      }),
    );
  }
  return outcomes;
}

// ---------------------------------------------------------------- entry points

export type AutomationSummary = {
  reminders: { sent: number; drafted: number; failed: number };
  completed: number;
  followUps: number;
  nudges: number;
  withdrawn: number;
};

const tally = (outcomes: string[], outcome: string) => outcomes.filter((o) => o === outcome).length;

/** Every automatic job for one agency. Safe to run as often as you like: each step happens once. */
export async function runAutomations(ctx: ToolContext, now = new Date(), options: { useAi?: boolean } = {}): Promise<AutomationSummary> {
  const actx = automationsCtx(ctx);
  const settings = await loadSettings(actx);
  const useAi = options.useAi ?? true;
  const withdrawn = await withdrawStaleReminders(actx, now);
  const reminders = settings.reminders ? await sendReminders(actx, now, settings.sendRemindersAutomatically) : [];
  const completed = await completeViewings(actx, now);
  const followUps = settings.followUps ? await draftFollowUps(actx, now, useAi) : [];
  const nudges = settings.nudges ? await draftNudges(actx, now, settings.nudgeAfterDays, useAi) : [];
  return {
    reminders: { sent: tally(reminders, "sent"), drafted: tally(reminders, "drafted"), failed: tally(reminders, "failed") },
    completed,
    followUps: tally(followUps, "drafted"),
    nudges: tally(nudges, "drafted"),
    withdrawn,
  };
}

/** The scheduler's entry point: runs the jobs for every agency, each in its own tenant context. */
export async function runAutomationsForAllAgencies(now = new Date(), database: Database = db) {
  const agencies = await database.select({ id: organization.id }).from(organization);
  const results: Record<string, AutomationSummary | { error: string }> = {};
  for (const { id } of agencies) {
    try {
      results[id] = await runAutomations({ db: database, agencyId: id, actor: { type: "system", id: null } }, now);
    } catch (error) {
      console.error(`Automations failed for ${id}`, error);
      results[id] = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  return results;
}
