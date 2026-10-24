import type { Qualification } from "@viewing/db/schema";
import type { Lang } from "./language";

type Option = { id: string; label: Record<Lang, string> };
export type QualificationQuestion = { id: string; question: Record<Lang, string>; options: Option[] };

const opt = (id: string, nl: string, fr: string, en: string): Option => ({ id, label: { nl, fr, en } });

/*
 * Short qualifying questions asked in the booking widget, so agents know who
 * they are meeting. Rental questions stay within what Belgian anti-discrimination
 * rules allow landlords to ask before a viewing (no income source, origin, etc.).
 */
export const qualificationQuestions: Record<"sale" | "rent", QualificationQuestion[]> = {
  sale: [
    {
      id: "purpose",
      question: { nl: "Waarvoor zoekt u?", fr: "Vous cherchez pour :", en: "What are you looking for?" },
      options: [opt("own", "Om zelf te wonen", "Y habiter", "To live in"), opt("invest", "Als investering", "Un investissement", "An investment")],
    },
    {
      id: "financing",
      question: { nl: "Heeft u al een financieringsakkoord?", fr: "Avez-vous déjà un accord de financement ?", en: "Do you have mortgage approval?" },
      options: [
        opt("yes", "Ja", "Oui", "Yes"),
        opt("pending", "In aanvraag", "En cours", "In progress"),
        opt("no", "Nog niet", "Pas encore", "Not yet"),
        opt("cash", "Niet nodig", "Pas nécessaire", "Not needed"),
      ],
    },
    {
      id: "sell_first",
      question: { nl: "Moet u eerst uw huidige woning verkopen?", fr: "Devez-vous d'abord vendre votre logement actuel ?", en: "Do you need to sell your current home first?" },
      options: [opt("no", "Nee", "Non", "No"), opt("yes", "Ja", "Oui", "Yes")],
    },
    {
      id: "timing",
      question: { nl: "Wanneer wilt u kopen?", fr: "Quand souhaitez-vous acheter ?", en: "When would you like to buy?" },
      options: [opt("3m", "Binnen 3 maanden", "Dans les 3 mois", "Within 3 months"), opt("6m", "3 tot 6 maanden", "3 à 6 mois", "3 to 6 months"), opt("later", "Later", "Plus tard", "Later")],
    },
  ],
  rent: [
    {
      id: "move_in",
      question: { nl: "Wanneer wilt u intrekken?", fr: "Quand souhaitez-vous emménager ?", en: "When would you like to move in?" },
      options: [opt("asap", "Zo snel mogelijk", "Dès que possible", "As soon as possible"), opt("1-3m", "Binnen 1 à 3 maanden", "Dans 1 à 3 mois", "In 1 to 3 months"), opt("later", "Later", "Plus tard", "Later")],
    },
    {
      id: "household",
      question: { nl: "Met hoeveel personen?", fr: "Combien de personnes ?", en: "How many people?" },
      options: [opt("1", "1", "1", "1"), opt("2", "2", "2", "2"), opt("3-4", "3–4", "3–4", "3–4"), opt("5+", "5+", "5+", "5+")],
    },
    {
      id: "pets",
      question: { nl: "Heeft u huisdieren?", fr: "Avez-vous des animaux ?", en: "Do you have pets?" },
      options: [opt("no", "Nee", "Non", "No"), opt("yes", "Ja", "Oui", "Yes")],
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
