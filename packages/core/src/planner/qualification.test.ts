import { describe, expect, it } from "vitest";
import type { BookingQuestion } from "@viewing/db/schema";
import { defaultBookingQuestions as defaults, localized, qualify, widgetQuestions } from "./qualification";

const custom: BookingQuestion[] = [
  { id: "parking", kind: "choice", question: { nl: "Heeft u een parkeerplaats nodig?", en: "Do you need parking?" }, options: [{ id: "y", label: { nl: "Ja", en: "Yes" } }, { id: "n", label: { nl: "Nee" } }] },
  { id: "notes", kind: "text", question: { nl: "Waar let u vooral op?" } },
  { id: "empty", kind: "choice", question: { nl: "Zonder antwoorden" }, options: [] },
];

describe("qualify", () => {
  it("marks a ready buyer as hot and an early one as cold", () => {
    expect(qualify(defaults.sale, "sale", { purpose: "own", financing: "yes", sell_first: "no", timing: "3m" }).temperature).toBe("hot");
    expect(qualify(defaults.sale, "sale", { financing: "no", timing: "later" }).temperature).toBe("cold");
    expect(qualify(defaults.rent, "rent", { move_in: "asap" }).answers[0]).toEqual({ id: "move_in", question: "When would you like to move in?", answer: "As soon as possible" });
  });

  it("words the answers in the agency's language", () => {
    expect(qualify(defaults.rent, "rent", { pets: "yes" }, "nl").answers).toEqual([{ id: "pets", question: "Heeft u huisdieren?", answer: "Ja" }]);
  });

  it("keeps free answers, trimmed and capped, and ignores unknown questions and options", () => {
    const result = qualify(custom, "sale", { parking: "n", notes: `  ${"x".repeat(600)} `, other: "1", empty: "z" }, "en");
    expect(result.answers).toEqual([
      { id: "parking", question: "Do you need parking?", answer: "Nee" },
      { id: "notes", question: "Waar let u vooral op?", answer: "x".repeat(500) },
    ]);
    expect(qualify(custom, "sale", { parking: "maybe" }).answers).toEqual([]);
  });

  it("gives no temperature when none of our scored questions was answered", () => {
    expect(qualify(custom, "sale", { parking: "y" }).temperature).toBeUndefined();
    expect(qualify(defaults.sale, "sale", { purpose: "own" }).temperature).toBeUndefined();
  });
});

describe("widgetQuestions", () => {
  it("shows each question in the client's language, falling back to the agency's", () => {
    const fr = widgetQuestions(custom, "fr", "nl");
    expect(fr).toEqual([
      { id: "parking", kind: "choice", question: "Heeft u een parkeerplaats nodig?", options: [{ id: "y", label: "Ja" }, { id: "n", label: "Nee" }] },
      { id: "notes", kind: "text", question: "Waar let u vooral op?", options: [] },
    ]);
    expect(widgetQuestions(custom, "en", "nl")[0]!.question).toBe("Do you need parking?");
  });

  it("has every default question in all four languages", () => {
    for (const q of [...defaults.sale, ...defaults.rent]) {
      for (const lang of ["nl", "fr", "en", "de"] as const) {
        expect(q.question[lang]).toBeTruthy();
        for (const o of q.options ?? []) expect(o.label[lang]).toBeTruthy();
      }
    }
  });

  it("falls back to any filled language", () => {
    expect(localized({ de: "Hallo" }, "fr", "nl")).toBe("Hallo");
    expect(localized({}, "fr")).toBe("");
  });
});
