import "server-only";
import { db, eq, schema } from "@viewing/db";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { auth } from "../auth";
import { isUiLang, langFromAcceptLanguage, makeT, UI_LANG_COOKIE, type UiLang } from "./index";

/**
 * The back office's language: the login's own choice (Settings in the menu), else the
 * language picked on this browser (login page), else the browser's languages, else English.
 */
export const getLang = cache(async (): Promise<UiLang> => {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders }).catch(() => null);
  if (session) {
    const [row] = await db.select({ language: schema.user.language }).from(schema.user).where(eq(schema.user.id, session.user.id));
    if (isUiLang(row?.language)) return row.language;
  }
  const cookie = (await cookies()).get(UI_LANG_COOKIE)?.value;
  if (isUiLang(cookie)) return cookie;
  return langFromAcceptLanguage(requestHeaders.get("accept-language"));
});

export async function getT() {
  return makeT(await getLang());
}

/** Saves the language for this login (when logged in) and this browser. */
export async function saveLang(lang: UiLang) {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  if (session) await db.update(schema.user).set({ language: lang }).where(eq(schema.user.id, session.user.id));
  (await cookies()).set(UI_LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
