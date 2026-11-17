import type { BookingQuestion, Localized, Qualification } from "@viewing/db/schema";
import type { Lang } from "./language";

type Option = NonNullable<BookingQuestion["options"]>[number];
type Transaction = "sale" | "rent";

const opt = (id: string, nl: string, fr: string, en: string, de: string): Option => ({ id, label: { nl, fr, en, de } });

/*
 * Short qualifying questions asked in the booking widget, so agents know who
 * they are meeting. Rental questions stay within what Belgian anti-discrimination
 * rules allow landlords to ask before a viewing (no income source, origin, etc.).
 */
export const defaultBookingQuestions: Record<Transaction, BookingQuestion[]> = {
  sale: [
    {
      kind: "choice",
      id: "purpose",
      question: { nl: "Waarvoor zoekt u?", fr: "Vous cherchez pour :", en: "What are you looking for?", de: "Wonach suchen Sie?" },
      options: [opt("own", "Om zelf te wonen", "Y habiter", "To live in", "Selbst bewohnen"), opt("invest", "Als investering", "Un investissement", "An investment", "Als Investition")],
    },
    {
      kind: "choice",
      id: "financing",
      question: { nl: "Heeft u al een financieringsakkoord?", fr: "Avez-vous déjà un accord de financement ?", en: "Do you have mortgage approval?", de: "Haben Sie bereits eine Finanzierungszusage?" },
      options: [
        opt("yes", "Ja", "Oui", "Yes", "Ja"),
        opt("pending", "In aanvraag", "En cours", "In progress", "In Bearbeitung"),
        opt("no", "Nog niet", "Pas encore", "Not yet", "Noch nicht"),
        opt("cash", "Niet nodig", "Pas nécessaire", "Not needed", "Nicht nötig"),
      ],
    },
    {
      kind: "choice",
      id: "sell_first",
      question: { nl: "Moet u eerst uw huidige woning verkopen?", fr: "Devez-vous d'abord vendre votre logement actuel ?", en: "Do you need to sell your current home first?", de: "Müssen Sie zuerst Ihre jetzige Wohnung verkaufen?" },
      options: [opt("no", "Nee", "Non", "No", "Nein"), opt("yes", "Ja", "Oui", "Yes", "Ja")],
    },
    {
      kind: "choice",
      id: "timing",
      question: { nl: "Wanneer wilt u kopen?", fr: "Quand souhaitez-vous acheter ?", en: "When would you like to buy?", de: "Wann möchten Sie kaufen?" },
      options: [opt("3m", "Binnen 3 maanden", "Dans les 3 mois", "Within 3 months", "Innerhalb von 3 Monaten"), opt("6m", "3 tot 6 maanden", "3 à 6 mois", "3 to 6 months", "3 bis 6 Monate"), opt("later", "Later", "Plus tard", "Later", "Später")],
    },
  ],
  rent: [
    {
      kind: "choice",
      id: "move_in",
      question: { nl: "Wanneer wilt u intrekken?", fr: "Quand souhaitez-vous emménager ?", en: "When would you like to move in?", de: "Wann möchten Sie einziehen?" },
      options: [opt("asap", "Zo snel mogelijk", "Dès que possible", "As soon as possible", "So bald wie möglich"), opt("1-3m", "Binnen 1 à 3 maanden", "Dans 1 à 3 mois", "In 1 to 3 months", "In 1 bis 3 Monaten"), opt("later", "Later", "Plus tard", "Later", "Später")],
    },
    {
      kind: "choice",
      id: "household",
      question: { nl: "Met hoeveel personen?", fr: "Combien de personnes ?", en: "How many people?", de: "Wie viele Personen?" },
      options: [opt("1", "1", "1", "1", "1"), opt("2", "2", "2", "2", "2"), opt("3-4", "3–4", "3–4", "3–4", "3–4"), opt("5+", "5+", "5+", "5+", "5+")],
    },
    {
      kind: "choice",
      id: "pets",
      question: { nl: "Heeft u huisdieren?", fr: "Avez-vous des animaux ?", en: "Do you have pets?", de: "Haben Sie Haustiere?" },
      options: [opt("no", "Nee", "Non", "No", "Nein"), opt("yes", "Ja", "Oui", "Yes", "Ja")],
    },
  ],
};

/** The text in this language, else the agency's own, else whichever language was filled in. */
export function localized(text: Localized | undefined, lang: Lang, fallback: Lang = "en"): string {
  if (!text) return "";
  return text[lang]?.trim() || text[fallback]?.trim() || Object.values(text).find((t) => t?.trim())?.trim() || "";
}

/** The questions as one client reads them, in their language. Empty questions and options are left out. */
export function widgetQuestions(questions: BookingQuestion[], lang: Lang, fallback: Lang = "en") {
  return questions
    .map((q) => ({
      id: q.id,
      kind: q.kind,
      question: localized(q.question, lang, fallback),
      options: (q.kind === "choice" ? (q.options ?? []) : []).map((o) => ({ id: o.id, label: localized(o.label, lang, fallback) })).filter((o) => o.label),
    }))
    .filter((q) => q.question && (q.kind === "text" || q.options.length > 0));
}

/** Longest free answer kept. */
export const MAX_ANSWER_LENGTH = 500;

/**
 * Turns what the client chose or typed into stored answers, worded in the
 * agency's language so agents read them as they wrote them, plus a simple
 * rule-based temperature when our default questions were answered.
 * Unknown questions or options are ignored.
 */
export function qualify(questions: BookingQuestion[], transaction: Transaction, choices: Record<string, string>, agencyLang: Lang = "en"): Qualification {
  const answers: Qualification["answers"] = [];
  for (const q of questions) {
    const raw = choices[q.id]?.trim();
    if (!raw) continue;
    const question = localized(q.question, agencyLang);
    if (q.kind === "text") {
      answers.push({ id: q.id, question, answer: raw.slice(0, MAX_ANSWER_LENGTH) });
    } else {
      const option = q.options?.find((o) => o.id === raw);
      if (option) answers.push({ id: q.id, question, answer: localized(option.label, agencyLang) });
    }
  }
  const picked = (id: string) => (answers.some((a) => a.id === id) ? choices[id] : undefined);

  let temperature: Qualification["temperature"];
  if (transaction === "sale" && (picked("financing") || picked("timing"))) {
    const ready = ["yes", "cash"].includes(picked("financing") ?? "") && picked("timing") === "3m" && picked("sell_first") !== "yes";
    const early = picked("financing") === "no" && picked("timing") === "later";
    temperature = ready ? "hot" : early ? "cold" : "warm";
  } else if (transaction === "rent" && picked("move_in")) {
    temperature = picked("move_in") === "asap" ? "hot" : picked("move_in") === "later" ? "cold" : "warm";
  }
  return { answers, ...(temperature && { temperature }) };
}
