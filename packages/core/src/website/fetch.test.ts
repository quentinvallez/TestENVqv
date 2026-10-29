import { describe, expect, it } from "vitest";
import { headerText } from "./fetch";

describe("redirect addresses", () => {
  it("reads a redirect sent as raw UTF-8 the way the site meant it", () => {
    const raw = String.fromCharCode(...new TextEncoder().encode("/nl/kopen/deurne/winkel-handelsruimte-135-m²/5585/"));
    expect(headerText(raw)).toBe("/nl/kopen/deurne/winkel-handelsruimte-135-m²/5585/");
    expect(headerText("/nl/kopen/5585/")).toBe("/nl/kopen/5585/");
    // Latin-1 that isn't UTF-8 stays as it came.
    expect(headerText("/fr/café/")).toBe("/fr/café/");
  });
});
