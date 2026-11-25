/*
 * Finds every text the back office translates: t("…"), t.rich("…") and msg("…")
 * in apps/web (app, components, lib). Used by i18n.test.ts to check nl.ts and fr.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const callRe = /(?<![\w.])(?:t|t\.rich|msg)\(\s*"((?:[^"\\]|\\.)*)"/g;

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "node_modules" || name === ".next") continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx?|ts)$/.test(name) && !/\.test\.ts$/.test(name) && !/[\\/]lib[\\/]i18n[\\/](nl|fr|keys)\.ts$/.test(path)) out.push(path);
  }
  return out;
}

export function translationKeys(root: string): Map<string, string> {
  const keys = new Map<string, string>();
  for (const dir of ["app", "components", "lib"]) {
    for (const file of walk(join(root, dir), [])) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(callRe)) {
        const key = JSON.parse(`"${match[1]}"`) as string;
        if (!keys.has(key)) keys.set(key, file);
      }
    }
  }
  return keys;
}
