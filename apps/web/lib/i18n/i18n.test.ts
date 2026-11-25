import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { translationKeys } from "./keys";
import { nl } from "./nl";
import { fr } from "./fr";

const root = fileURLToPath(new URL("../..", import.meta.url));
const keys = translationKeys(root);
const placeholders = (s: string) => [...s.matchAll(/\{\w+\}|<\/?\w+>/g)].map((m) => m[0]).sort();

describe.each([
  ["nl", nl],
  ["fr", fr],
])("%s back-office text", (_lang, dict) => {
  it("translates every text in the code", () => {
    const missing = [...keys].filter(([key]) => !dict[key]).map(([key, file]) => `${key}  (${file.slice(root.length)})`);
    expect(missing).toEqual([]);
  });

  it("keeps the same {placeholders} and <tags>", () => {
    const wrong = [...keys.keys()].filter((key) => dict[key] && placeholders(dict[key]!).join() !== placeholders(key).join());
    expect(wrong).toEqual([]);
  });

  it("has no texts the code no longer uses", () => {
    expect(Object.keys(dict).filter((key) => !keys.has(key))).toEqual([]);
  });
});
