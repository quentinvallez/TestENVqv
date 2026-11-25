"use server";

import { isUiLang } from "./index";
import { saveLang } from "./server";

export async function setUiLanguage(lang: string) {
  if (!isUiLang(lang)) return;
  await saveLang(lang);
}
