"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { contrast, parseColour, rgbText, textOn } from "@viewing/core/colour";
import { Button } from "@/components/ui";
import type { BrandColourState } from "../actions";

const field = "h-8 w-full min-w-0 rounded-md border border-line bg-panel px-2.5 font-mono text-[12px] outline-none focus:border-line-strong";
/** What the buttons and the widget use when there is no colour at all (as widget.js). */
const FALLBACK = "#111111";

/**
 * The colour of the floating buttons and the widget on the agency's website: the one read from the site,
 * or one the agency picks or types (hex or RGB), with a live preview and a way back to the site's colour.
 */
export function BrandColour({
  current,
  detected,
  chosen,
  canEdit,
  save,
}: {
  current: string | null;
  detected: string | null;
  chosen: boolean;
  canEdit: boolean;
  save: (colour: string | null) => Promise<BrandColourState>;
}) {
  const [text, setText] = useState(current ?? "");
  const [state, setState] = useState<BrandColourState>();
  const [pending, start] = useTransition();
  const typed = parseColour(text);
  const shown = typed ?? current ?? FALLBACK;
  const changed = Boolean(typed && typed !== current);
  const invalid = text.trim() !== "" && !typed;

  const submit = (colour: string | null) =>
    start(async () => {
      const result = await save(colour);
      setState(result);
      if (!result?.error) setText(colour === null ? (detected ?? "") : (parseColour(colour) ?? colour));
    });

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="text-muted">
          {chosen ? (
            <>Your own colour.</>
          ) : current ? (
            <>Read from your website.</>
          ) : (
            <>No colour yet: the buttons take the most common button colour of each page they show on.</>
          )}{" "}
          {detected && chosen && (
            <>
              Your website&apos;s is{" "}
              <span className="inline-block size-3 rounded-full border border-line align-[-1px]" style={{ background: detected }} />{" "}
              <span className="font-mono text-[12px]">{detected}</span>.
            </>
          )}
        </div>

        {canEdit ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed) submit(typed);
            }}
          >
            <label htmlFor="brand-code" className="text-[12px] font-medium text-muted">
              Colour code (hex or RGB)
            </label>
            <div className="flex items-center gap-2">
              <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line" style={{ background: shown }}>
                <span className="sr-only">Pick a colour</span>
                <input
                  type="color"
                  value={shown}
                  onChange={(e) => {
                    setText(e.target.value);
                    setState(undefined);
                  }}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
              <input
                id="brand-code"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setState(undefined);
                }}
                placeholder="#1e3a31 or 30, 58, 49"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={invalid}
                aria-describedby="brand-hint"
                className={`${field} ${invalid ? "border-danger focus:border-danger" : ""}`}
              />
              <Button type="submit" variant="primary" disabled={!changed || pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
            <p id="brand-hint" className="text-[12px] text-faint">
              {invalid ? (
                <span className="text-danger">Not a colour code. Try #1e3a31, 1e3a31 or rgb(30, 58, 49).</span>
              ) : typed ? (
                <>
                  <span className="font-mono">{typed}</span> · <span className="font-mono">rgb({rgbText(typed)})</span>
                </>
              ) : (
                "Type a code from your brand guide or pick one."
              )}
            </p>
            {typed && contrast(typed, "#ffffff") < 1.6 && (
              <p className="text-[12px] text-muted">
                <span className="mr-1.5 inline-block size-1.5 rounded-full bg-warning align-middle" />
                Very light: on a white page the buttons will hardly stand out.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {chosen && (
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => submit(null)}>
                  <RotateCcw className="size-3.5" />
                  {detected ? "Use my website's colour" : "Use each page's own colour"}
                </Button>
              )}
              {state?.saved && (
                <span className="inline-flex items-center gap-1 text-[12px] text-muted" role="status">
                  <Check className="size-3.5 text-success" />
                  Saved. Your website shows it on the next page view.
                </span>
              )}
              {state?.error && (
                <span className="text-[12px] text-danger" role="alert">
                  {state.error}
                </span>
              )}
            </div>
          </form>
        ) : (
          <p className="flex items-center gap-2 text-muted">
            <span className="inline-block size-4 rounded-full border border-line" style={{ background: shown }} />
            <span className="font-mono text-[12px]">{current ?? "—"}</span>
            <span className="text-[12px]">Only the agency&apos;s admins can change it.</span>
          </p>
        )}
      </div>
      <Preview colour={shown} />
    </div>
  );
}

/** A small listing page with the widget's day and time choice and the floating button, in the colour. */
function Preview({ colour }: { colour: string }) {
  const on = textOn(colour);
  return (
    <div aria-label="Preview" className="relative h-[220px] overflow-hidden rounded-md border border-line bg-[#ffffff] text-[#1a1a1a] [color-scheme:light]">
      <div className="flex h-6 items-center gap-1 border-b border-[#e8e8e8] px-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 rounded-full bg-[#d4d4d4]" />
        ))}
      </div>
      <div className="p-3">
        <div className="h-2 w-24 rounded-full bg-[#e5e5e5]" />
        <div className="mt-1.5 h-2 w-16 rounded-full bg-[#efefef]" />
        <div className="mt-3 text-[11px] font-semibold">Plan een bezoek</div>
        <div className="mt-1.5 flex gap-1">
          {["di 24", "wo 25", "do 26"].map((d, i) => (
            <span
              key={d}
              className="rounded-md border px-1.5 py-1 text-[10px]"
              style={i === 1 ? { background: colour, borderColor: colour, color: on } : { borderColor: "#e5e5e5" }}
            >
              {d}
            </span>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1">
          {["10:00", "10:30", "14:00"].map((t, i) => (
            <span
              key={t}
              className="rounded-md border px-1.5 py-1 text-[10px] tabular-nums"
              style={i === 0 ? { borderColor: colour, boxShadow: `inset 0 0 0 1px ${colour}` } : { borderColor: "#e5e5e5" }}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-2 inline-flex h-6 items-center rounded-md px-2.5 text-[10px] font-medium" style={{ background: colour, color: on }}>
          Bevestig bezoek
        </div>
      </div>
      <div
        className="absolute right-2.5 bottom-2.5 flex h-8 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-[11px] font-semibold shadow-[0_4px_14px_rgba(0,0,0,.2)]"
        style={{ background: colour, color: on }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
        Plan een bezoek
      </div>
    </div>
  );
}
