import { eq, schema } from "@viewing/db";
import type { BookingQuestion } from "@viewing/db/schema";
import { z } from "zod";
import { recordEvent } from "../events";
import { toLang, type Lang } from "../planner/language";
import { defaultBookingQuestions, widgetQuestions } from "../planner/qualification";
import { defineTool, type ToolContext } from "../tool";

/*
 * The questions a client answers in the booking widget, one set for listings
 * for sale and one for listings to rent, the same on every listing of that
 * kind. Agencies that never changed them get our defaults. Answers go with the
 * booking to the lead, the agent's email and the agent's calendar event.
 */

const { agencySettings } = schema;

const transaction = z.enum(["sale", "rent"]);
const id = z.string().regex(/^[a-z0-9_-]{1,40}$/i);
const text = (max: number) => z.string().trim().max(max).optional();
const localizedText = (max: number) =>
  z
    .object({ nl: text(max), fr: text(max), en: text(max), de: text(max) })
    .transform((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v)) as BookingQuestion["question"])
    .refine((t) => Object.keys(t).length > 0, "Fill in the text in at least one language");

export const MAX_QUESTIONS = 10;
export const MAX_OPTIONS = 8;

const questionInput = z
  .object({
    id,
    kind: z.enum(["choice", "text"]),
    question: localizedText(200),
    options: z.array(z.object({ id, label: localizedText(80) })).max(MAX_OPTIONS).optional(),
  })
  .transform((q): BookingQuestion => (q.kind === "text" ? { id: q.id, kind: "text", question: q.question } : { id: q.id, kind: "choice", question: q.question, options: q.options ?? [] }))
  .refine((q) => q.kind === "text" || (q.options?.length ?? 0) >= 2, "A question with choices needs at least two answers")
  .refine((q) => new Set(q.options?.map((o) => o.id)).size === (q.options?.length ?? 0), "Two answers share an id");

/** The agency's questions for this kind of listing (ours when they never changed them) and the language they write in. */
export async function agencyBookingQuestions(ctx: ToolContext, kind: "sale" | "rent"): Promise<{ questions: BookingQuestion[]; custom: boolean; lang: Lang }> {
  const [row] = await ctx.db
    .select({ widget: agencySettings.widget, defaultLanguage: agencySettings.defaultLanguage })
    .from(agencySettings)
    .where(eq(agencySettings.agencyId, ctx.agencyId));
  const own = row?.widget.questions?.[kind];
  return { questions: own ?? defaultBookingQuestions[kind], custom: Boolean(own), lang: toLang(row?.defaultLanguage) };
}

export const getBookingQuestions = defineTool({
  name: "booking_questions_get",
  description: "The questions clients answer when they book a viewing in the widget: one set for listings for sale, one for listings to rent, with their text in NL/FR/EN/DE.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const [sale, rent] = await Promise.all([agencyBookingQuestions(ctx, "sale"), agencyBookingQuestions(ctx, "rent")]);
    return {
      sale: { questions: sale.questions, custom: sale.custom },
      rent: { questions: rent.questions, custom: rent.custom },
      defaults: defaultBookingQuestions,
      language: sale.lang,
    };
  },
});

export const bookingQuestionsForWidget = defineTool({
  name: "booking_questions_for_widget",
  description: "The booking questions for one kind of listing as a client reads them, in their language.",
  mutates: false,
  input: z.object({ transaction, lang: z.enum(["nl", "fr", "en", "de"]) }),
  run: async (ctx, input) => {
    const { questions, lang } = await agencyBookingQuestions(ctx, input.transaction);
    return widgetQuestions(questions, input.lang, lang);
  },
});

export const updateBookingQuestions = defineTool({
  name: "booking_questions_update",
  description:
    "Set the questions clients answer when they book a viewing of a listing for sale or to rent. They apply to every listing of that kind. Pass null to go back to the default questions; an empty list asks nothing.",
  mutates: true,
  input: z.object({
    transaction,
    questions: z
      .array(questionInput)
      .max(MAX_QUESTIONS)
      .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, "Two questions share an id")
      .nullable(),
  }),
  run: async (ctx, input) => {
    const [row] = await ctx.db.select({ widget: agencySettings.widget }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
    const questions = { ...row?.widget.questions };
    if (input.questions) questions[input.transaction] = input.questions;
    else delete questions[input.transaction];
    const widget = { ...row?.widget, questions };
    await ctx.db
      .insert(agencySettings)
      .values({ agencyId: ctx.agencyId, widget })
      .onConflictDoUpdate({ target: agencySettings.agencyId, set: { widget } });
    await recordEvent(ctx, {
      type: "settings.booking_questions_updated",
      subjectType: "agency",
      subjectId: ctx.agencyId,
      data: { transaction: input.transaction, count: input.questions?.length ?? null, reset: input.questions === null },
    });
    return { questions: input.questions ?? defaultBookingQuestions[input.transaction], custom: input.questions !== null };
  },
});
