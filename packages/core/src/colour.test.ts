import { describe, expect, it } from "vitest";
import { contrast, parseColour, rgbText, textOn } from "./colour";

describe("parseColour", () => {
  it("reads hex codes, with or without #, short or long", () => {
    expect(parseColour("#1E3A31")).toBe("#1e3a31");
    expect(parseColour("1e3a31")).toBe("#1e3a31");
    expect(parseColour(" #f80 ")).toBe("#ff8800");
  });

  it("reads RGB codes as people type them", () => {
    expect(parseColour("rgb(30, 58, 49)")).toBe("#1e3a31");
    expect(parseColour("RGB(30,58,49)")).toBe("#1e3a31");
    expect(parseColour("30, 58, 49")).toBe("#1e3a31");
    expect(parseColour("30 58 49")).toBe("#1e3a31");
    expect(parseColour("rgba(30, 58, 49, 0.5)")).toBe("#1e3a31");
    expect(parseColour("rgb(255 0 0 / 50%)")).toBe("#ff0000");
  });

  it("refuses anything else", () => {
    for (const bad of ["", "red", "#12345", "#gggggg", "rgb(256, 0, 0)", "30, 58", "1e3a31; background:url(x)"]) expect(parseColour(bad)).toBeNull();
  });
});

describe("text on a colour", () => {
  it("picks white on dark colours and near-black on light ones", () => {
    expect(textOn("#1e3a31")).toBe("#ffffff");
    expect(textOn("#ffd400")).toBe("#111111");
    expect(rgbText("#1e3a31")).toBe("30, 58, 49");
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21);
  });
});
