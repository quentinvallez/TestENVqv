/*
 * Back-office languages. Texts are written in English in the code, wrapped in t():
 *   t("Viewings planned"), t("{n} viewings", { n }), t.rich("Open <a>settings</a>", { a: (c) => <Link …>{c}</Link> })
 * The English text is the key; nl.ts and fr.ts hold the translations (a missing one shows the English).
 * i18n.test.ts fails when a t("…") text or a label in lib/labels.ts has no Dutch or French.
 * Client-safe: no database, no server-only imports.
 */
import { Fragment, type ReactNode } from "react";
import { AGENCY_TIMEZONE } from "@viewing/core/time";
import { fr } from "./fr";
import { nl } from "./nl";

export const uiLangs = ["nl", "fr", "en"] as const;
export type UiLang = (typeof uiLangs)[number];
export const uiLangNames: Record<UiLang, string> = { nl: "Nederlands", fr: "Français", en: "English" };
export const UI_LANG_COOKIE = "ui-lang";

const dictionaries: Record<Exclude<UiLang, "en">, Record<string, string>> = { nl, fr };
const locales: Record<UiLang, string> = { nl: "nl-BE", fr: "fr-BE", en: "en-GB" };

export function isUiLang(value: unknown): value is UiLang {
  return typeof value === "string" && (uiLangs as readonly string[]).includes(value);
}

/** The first of the browser's languages we have (nl, fr, en); English otherwise. */
export function langFromAcceptLanguage(header: string | null | undefined): UiLang {
  for (const part of (header ?? "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isUiLang(code)) return code;
  }
  return "en";
}

export type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export function translate(lang: UiLang, text: string, vars?: Vars) {
  return fill(lang === "en" ? text : (dictionaries[lang][text] ?? text), vars);
}

/** Text with simple tags (<a>…</a>, not nested) turned into elements, and {vars} filled in. */
function rich(lang: UiLang, text: string, parts: Record<string, (chunk: ReactNode) => ReactNode>, vars?: Vars): ReactNode {
  const translated = translate(lang, text, vars);
  const out: ReactNode[] = [];
  const re = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(translated))) {
    if (match.index > last) out.push(translated.slice(last, match.index));
    const render = parts[match[1]!];
    out.push(<Fragment key={out.length}>{render ? render(match[2]) : match[2]}</Fragment>);
    last = re.lastIndex;
  }
  if (last < translated.length) out.push(translated.slice(last));
  return <>{out}</>;
}

export type T = ((text: string, vars?: Vars) => string) & {
  lang: UiLang;
  locale: string;
  rich: (text: string, parts: Record<string, (chunk: ReactNode) => ReactNode>, vars?: Vars) => ReactNode;
  /** "ma 3 nov." / "Mon 3 Nov" in Brussels time. */
  day: (date: Date) => string;
  time: (date: Date) => string;
  dateTime: (date: Date) => string;
  /** "5m ago", "il y a 2 h"… then the day. */
  relative: (date: Date, now?: Date) => string;
  price: (price: number | null | undefined, transaction?: "sale" | "rent") => string;
  number: (n: number) => string;
};

export function makeT(lang: UiLang): T {
  const locale = locales[lang];
  const t = ((text: string, vars?: Vars) => translate(lang, text, vars)) as T;
  t.lang = lang;
  t.locale = locale;
  t.rich = (text, parts, vars) => rich(lang, text, parts, vars);
  t.day = (date) =>
    new Intl.DateTimeFormat(locale, { timeZone: AGENCY_TIMEZONE, weekday: "short", day: "numeric", month: "short" }).format(date);
  t.time = (date) => new Intl.DateTimeFormat(locale, { timeZone: AGENCY_TIMEZONE, hour: "2-digit", minute: "2-digit" }).format(date);
  t.dateTime = (date) => `${t.day(date)} · ${t.time(date)}`;
  t.relative = (date, now = new Date()) => {
    const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
    if (minutes < 1) return t("just now");
    if (minutes < 60) return t("{n}m ago", { n: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t("{n}h ago", { n: hours });
    const days = Math.round(hours / 24);
    if (days < 7) return t("{n}d ago", { n: days });
    return t.day(date);
  };
  t.price = (price, transaction) => {
    if (price == null) return t("Price on request");
    const amount = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(price);
    return transaction === "rent" ? t("{amount}/mo", { amount }) : amount;
  };
  t.number = (n) => new Intl.NumberFormat(locale).format(n);
  return t;
}

/** Marks a text for translation where it is defined (label maps); translate it with t() where it is shown. */
export const msg = (text: string) => text;
