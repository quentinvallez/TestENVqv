import { describe, expect, it } from "vitest";
import { formatSlot, templates, toLang } from "./language";

describe("client languages", () => {
  it("speaks Dutch, French, German and English, and English when the language is unknown", () => {
    expect(toLang("nl")).toBe("nl");
    expect(toLang("fr")).toBe("fr");
    expect(toLang("de")).toBe("de");
    expect(toLang("en")).toBe("en");
    expect(toLang(null)).toBe("en");
    expect(toLang(undefined)).toBe("en");
    expect(toLang("es")).toBe("en");
  });

  it("writes times and templates in German", () => {
    expect(formatSlot(new Date("2026-11-20T13:30:00Z"), "de")).toMatch(/um 14:30$/);
    expect(Object.values(templates).every((byLang) => typeof byLang.de === "function")).toBe(true);
  });
});
