"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type UiLang } from "./index";

const LangContext = createContext<UiLang>("en");

/** Set in the app and login layouts from the login's language (see lib/i18n/server.ts). */
export function I18nProvider({ lang, children }: { lang: UiLang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useT() {
  const lang = useContext(LangContext);
  return useMemo(() => makeT(lang), [lang]);
}
