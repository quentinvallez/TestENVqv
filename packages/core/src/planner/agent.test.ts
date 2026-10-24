import { describe, expect, it } from "vitest";
import { zonedTime } from "../time";
import { pickSpreadSlots } from "./agent";
import { composeMessage, formatSlot } from "./language";
import { qualify } from "./qualification";

const at = (day: number, hour: number) => ({ start: zonedTime({ year: 2027, month: 3, day, hour }) });

describe("pickSpreadSlots", () => {
  it("picks one slot per day, alternating morning and afternoon", () => {
    const slots = [at(2, 9), at(2, 14), at(3, 9), at(3, 15), at(4, 10), at(4, 16), at(5, 9)];
    const picked = pickSpreadSlots(slots).map((d) => formatSlot(d, "en"));
    expect(picked).toEqual(["Tue 2 Mar at 09:00", "Wed 3 Mar at 15:00", "Thu 4 Mar at 10:00"]);
  });
});

describe("composeMessage", () => {
  it("appends times, link and signature in the client's language", () => {
    const text = composeMessage({ lang: "fr", body: "Bonjour Camille,", slots: [at(2, 9).start], link: { url: "https://x/a", label: "Modifier" }, signature: "– Lien" });
    expect(text).toBe("Bonjour Camille,\n\n• mar. 2 mars à 09:00\n\nModifier: https://x/a\n\n– Lien");
  });
});

describe("qualify", () => {
  it("marks a ready buyer as hot and an early one as cold", () => {
    expect(qualify("sale", { purpose: "own", financing: "yes", sell_first: "no", timing: "3m" }).temperature).toBe("hot");
    expect(qualify("sale", { financing: "no", timing: "later" }).temperature).toBe("cold");
    expect(qualify("rent", { move_in: "asap" }).answers[0]).toEqual({ id: "move_in", question: "When would you like to move in?", answer: "As soon as possible" });
  });
});
