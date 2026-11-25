"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, ListChecks, Plus, TextCursorInput, Trash2, X } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { BookingQuestionsState } from "../../actions";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n";

type Lang = "nl" | "fr" | "en" | "de";
type Text = Partial<Record<Lang, string>>;
type Question = { id: string; kind: "choice" | "text"; question: Text; options?: { id: string; label: Text }[] };

const langs: { id: Lang; label: string; name: string }[] = [
  { id: "nl", label: "NL", name: msg("Dutch") },
  { id: "fr", label: "FR", name: msg("French") },
  { id: "en", label: "EN", name: msg("English") },
  { id: "de", label: "DE", name: msg("German") },
];

const field = "h-9 w-full min-w-0 rounded-md border border-line bg-panel px-2.5 outline-none placeholder:text-faint focus:border-line-strong";
const iconButton = "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30";

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
const filled = (t: Text) => Object.values(t).some((v) => v?.trim());
/** What a client reading `lang` sees when it isn't filled in: the agency's own language, else any. */
const fallback = (t: Text, lang: Lang, agencyLang: Lang) => (t[lang]?.trim() ? "" : t[agencyLang]?.trim() || Object.values(t).find((v) => v?.trim()) || "");

/** Booking questions for one kind of listing, edited one language at a time. */
export function QuestionsEditor({
  kind,
  initial,
  custom,
  agencyLang,
  limits,
  save,
}: {
  kind: "sale" | "rent";
  initial: Question[];
  custom: boolean;
  agencyLang: Lang;
  limits: { questions: number; options: number };
  save: (questions: Question[] | null) => Promise<BookingQuestionsState>;
}) {
  const t = useT();
  const [questions, setQuestions] = useState<Question[]>(initial);
  const [lang, setLang] = useState<Lang>(agencyLang);
  const [dirty, setDirty] = useState(false);
  const [isCustom, setCustom] = useState(custom);
  const [state, setState] = useState<BookingQuestionsState>();
  const [pending, startTransition] = useTransition();

  const change = (next: Question[]) => {
    setQuestions(next);
    setDirty(true);
    setState(undefined);
  };
  const update = (i: number, q: Question) => change(questions.map((x, j) => (j === i ? q : x)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...questions];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    change(next);
  };
  const add = (k: Question["kind"]) =>
    change([...questions, k === "text" ? { id: newId("q"), kind: "text", question: {} } : { id: newId("q"), kind: "choice", question: {}, options: [{ id: newId("o"), label: {} }, { id: newId("o"), label: {} }] }]);

  // Texts with nothing in this language: those clients see the fallback.
  const missing = (l: Lang) =>
    questions.reduce((n, q) => n + (filled(q.question) && !q.question[l]?.trim() ? 1 : 0) + (q.options ?? []).filter((o) => filled(o.label) && !o.label[l]?.trim()).length, 0);
  const missingHere = missing(lang);
  const langName = t(langs.find((l) => l.id === lang)!.name);

  const submit = (value: Question[] | null) => {
    if (value) {
      // Answers left empty in every language are dropped; an empty question is a mistake to point out.
      value = value.map((q) => (q.kind === "choice" ? { ...q, options: (q.options ?? []).filter((o) => filled(o.label)) } : { id: q.id, kind: q.kind, question: q.question }));
      const blank = value.findIndex((q) => !filled(q.question));
      if (blank >= 0) return setState({ error: t("Question {n} has no text yet.", { n: blank + 1 }) });
      const few = value.findIndex((q) => q.kind === "choice" && (q.options?.length ?? 0) < 2);
      if (few >= 0) return setState({ error: t("Question {n} needs at least two answers to choose from.", { n: few + 1 }) });
    }
    startTransition(async () => {
      const result = await save(value);
      setState(result);
      if (result?.questions) {
        setDirty(false);
        setQuestions(result.questions);
        setCustom(Boolean(result.custom));
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-muted">{t("Text in")}</span>
        <div className="inline-flex rounded-md border border-line bg-panel p-0.5">
          {langs.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLang(l.id)}
              aria-pressed={l.id === lang}
              className={cn("relative rounded px-2.5 py-1 text-[12px] transition-colors", l.id === lang ? "bg-hover font-medium text-fg" : "text-muted hover:text-fg")}
            >
              {l.label}
              {missing(l.id) > 0 && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warning" aria-label={t("Some texts missing")} />}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-muted">
          {missingHere > 0
            ? missingHere === 1
              ? t("1 text has no {language} yet. Clients who speak {language} see it in your default language, shown in grey.", { language: langName })
              : t("{n} texts have no {language} yet. Clients who speak {language} see it in your default language, shown in grey.", { n: missingHere, language: langName })
            : t("Clients see the questions in their own language.")}
        </span>
      </div>

      {questions.length === 0 && (
        <Panel className="px-4 py-6 text-center text-muted">{t("No questions: clients go straight from the time to their details.")}</Panel>
      )}

      {questions.map((q, i) => (
        <Panel key={q.id} className="p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-muted">{t("Question {n}", { n: i + 1 })}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
              {q.kind === "choice" ? <ListChecks className="size-3" /> : <TextCursorInput className="size-3" />}
              {q.kind === "choice" ? t("Choose one") : t("Free answer")}
            </span>
            <div className="ml-auto flex items-center">
              <button type="button" className={iconButton} disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("Move up")} title={t("Move up")}>
                <ArrowUp className="size-4" />
              </button>
              <button type="button" className={iconButton} disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label={t("Move down")} title={t("Move down")}>
                <ArrowDown className="size-4" />
              </button>
              <button type="button" className={iconButton} onClick={() => change(questions.filter((_, j) => j !== i))} aria-label={t("Remove question")} title={t("Remove question")}>
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
          <input
            value={q.question[lang] ?? ""}
            placeholder={fallback(q.question, lang, agencyLang) || t("Type the question")}
            maxLength={200}
            onChange={(e) => update(i, { ...q, question: { ...q.question, [lang]: e.target.value } })}
            aria-label={`${t("Question {n}", { n: i + 1 })} (${langName})`}
            className={cn(field, "mt-2 font-medium")}
          />
          {q.kind === "choice" ? (
            <div className="mt-2 flex flex-col gap-1.5 sm:pl-4">
              {(q.options ?? []).map((o, k) => (
                <div key={o.id} className="flex items-center gap-1.5">
                  <span className="size-3 shrink-0 rounded-full border border-line-strong" aria-hidden />
                  <input
                    value={o.label[lang] ?? ""}
                    placeholder={fallback(o.label, lang, agencyLang) || t("Answer {n}", { n: k + 1 })}
                    maxLength={80}
                    onChange={(e) => update(i, { ...q, options: q.options!.map((x, j) => (j === k ? { ...x, label: { ...x.label, [lang]: e.target.value } } : x)) })}
                    aria-label={`${t("Question {n}", { n: i + 1 })}, ${t("Answer {n}", { n: k + 1 })} (${langName})`}
                    className={cn(field, "h-8")}
                  />
                  <button
                    type="button"
                    className={iconButton}
                    disabled={(q.options?.length ?? 0) <= 2}
                    onClick={() => update(i, { ...q, options: q.options!.filter((_, j) => j !== k) })}
                    aria-label={t("Remove answer")}
                    title={t("Remove answer")}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              {(q.options?.length ?? 0) < limits.options && (
                <button
                  type="button"
                  onClick={() => update(i, { ...q, options: [...(q.options ?? []), { id: newId("o"), label: {} }] })}
                  className="flex h-8 items-center gap-1.5 self-start rounded-md px-1.5 text-muted hover:bg-hover hover:text-fg"
                >
                  <Plus className="size-3.5" />
                  {t("Add answer")}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-muted sm:pl-4">{t("Clients type a short answer (up to 500 characters).")}</p>
          )}
        </Panel>
      ))}

      {questions.length < limits.questions ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => add("choice")}>
            <Plus className="size-3.5" />
            {t("Question with choices")}
          </Button>
          <Button type="button" onClick={() => add("text")}>
            <Plus className="size-3.5" />
            {t("Free answer question")}
          </Button>
        </div>
      ) : (
        <p className="text-[12px] text-muted">{t("Up to {n} questions; fewer questions get more answers.", { n: limits.questions })}</p>
      )}

      <div className="sticky bottom-0 -mx-1 mt-2 flex flex-wrap items-center gap-3 border-t border-line bg-panel px-1 py-3">
        <Button variant="primary" type="button" disabled={pending || !dirty} onClick={() => submit(questions)}>
          {pending ? t("Saving…") : kind === "sale" ? t("Save sale questions") : t("Save rental questions")}
        </Button>
        {(isCustom || dirty) && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t("Go back to our default questions? Your own questions for this kind of listing are removed."))) submit(null);
            }}
          >
            {t("Use our default questions")}
          </Button>
        )}
        {state?.error && <span className="text-danger">{state.error}</span>}
        {state?.savedAt && !dirty && (
          <span className="inline-flex items-center gap-1 text-muted">
            <Check className="size-3.5 text-success" />
            {t("Saved. New bookings get these questions.")}
          </span>
        )}
      </div>
    </div>
  );
}
