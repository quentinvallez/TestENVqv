import type { Qualification } from "@viewing/db/schema";
import type { Lang } from "./language";

type Option = { id: string; label: Record<Lang, string> };
export type QualificationQuestion = { id: string; question: Record<Lang, string>; options: Option[] };

const opt = (id: string, nl: string, fr: string, en: string, de: string): Option => ({ id, label: { nl, fr, en, de } });

/*
 * Short qualifying questions asked in the booking widget, so agents know who
 * they are meeting. Rental questions stay within what Belgian anti-discrimination
 * rules allow landlords to ask before a viewing (no income source, origin, etc.).
 */
export const qualificationQuestions: Record<"sale" | "rent", QualificationQuestion[]> = {
  sale: [
    {
      id: "purpose",
      question: { nl: "Waarvoor zoekt u?", fr: "Vous cherchez pour :", en: "What are you looking for?", de: "Wonach suchen Sie?" },
      options: [opt("own", "Om zelf te wonen", "Y habiter", "To live in", "Selbst bewohnen"), opt("invest", "Als investering", "Un investissement", "An investment", "Als Investition")],
    },
    {
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
      id: "sell_first",
      question: { nl: "Moet u eerst uw huidige woning verkopen?", fr: "Devez-vous d'abord vendre votre logement actuel ?", en: "Do you need to sell your current home first?", de: "Müssen Sie zuerst Ihre jetzige Wohnung verkaufen?" },
      options: [opt("no", "Nee", "Non", "No", "Nein"), opt("yes", "Ja", "Oui", "Yes", "Ja")],
    },
    {
      id: "timing",
      question: { nl: "Wanneer wilt u kopen?", fr: "Quand souhaitez-vous acheter ?", en: "When would you like to buy?", de: "Wann möchten Sie kaufen?" },
      options: [opt("3m", "Binnen 3 maanden", "Dans les 3 mois", "Within 3 months", "Innerhalb von 3 Monaten"), opt("6m", "3 tot 6 maanden", "3 à 6 mois", "3 to 6 months", "3 bis 6 Monate"), opt("later", "Later", "Plus tard", "Later", "Später")],
    },
  ],
  rent: [
    {
      id: "move_in",
      question: { nl: "Wanneer wilt u intrekken?", fr: "Quand souhaitez-vous emménager ?", en: "When would you like to move in?", de: "Wann möchten Sie einziehen?" },
      options: [opt("asap", "Zo snel mogelijk", "Dès que possible", "As soon as possible", "So bald wie möglich"), opt("1-3m", "Binnen 1 à 3 maanden", "Dans 1 à 3 mois", "In 1 to 3 months", "In 1 bis 3 Monaten"), opt("later", "Later", "Plus tard", "Later", "Später")],
    },
    {
      id: "household",
      question: { nl: "Met hoeveel personen?", fr: "Combien de personnes ?", en: "How many people?", de: "Wie viele Personen?" },
      options: [opt("1", "1", "1", "1", "1"), opt("2", "2", "2", "2", "2"), opt("3-4", "3–4", "3–4", "3–4", "3–4"), opt("5+", "5+", "5+", "5+", "5+")],
    },
    {
      id: "pets",
      question: { nl: "Heeft u huisdieren?", fr: "Avez-vous des animaux ?", en: "Do you have pets?", de: "Haben Sie Haustiere?" },
      options: [opt("no", "Nee", "Non", "No", "Nein"), opt("yes", "Ja", "Oui", "Yes", "Ja")],
    },
  ],
};

/** Turns chosen option ids into stored answers (in the agency's language) and a rule-based temperature. */
export function qualify(transaction: "sale" | "rent", choices: Record<string, string>): Qualification {
  const questions = qualificationQuestions[transaction];
  const answers = questions
    .filter((q) => choices[q.id])
    .map((q) => ({ id: q.id, question: q.question.en, answer: q.options.find((o) => o.id === choices[q.id])?.label.en ?? choices[q.id]! }));

  let temperature: Qualification["temperature"] = "warm";
  if (transaction === "sale") {
    const ready = ["yes", "cash"].includes(choices.financing ?? "") && choices.timing === "3m" && choices.sell_first !== "yes";
    const early = choices.financing === "no" && choices.timing === "later";
    temperature = ready ? "hot" : early ? "cold" : "warm";
  } else {
    temperature = choices.move_in === "asap" ? "hot" : choices.move_in === "later" ? "cold" : "warm";
  }
  return { answers, temperature: answers.length ? temperature : undefined };
}
