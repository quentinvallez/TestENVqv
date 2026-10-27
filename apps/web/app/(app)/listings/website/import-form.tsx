"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui";
import type { WebsiteImportState } from "../../actions";

const field = "h-8 w-full min-w-0 rounded-md border border-line bg-panel px-2.5 outline-none focus:border-line-strong";

type Progress = { checked: number; created: number; updated: number };

/**
 * The agency's website address and the button that reads it. One run reads for
 * under a minute; while pages are left, the form starts the next run itself
 * until the site is read or the agency stops it.
 */
export function ImportForm({
  action,
  websiteUrl,
  label,
}: {
  action: (state: WebsiteImportState, form: FormData) => Promise<WebsiteImportState>;
  websiteUrl: string | null;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [running, setRunning] = useState(false);
  // Totals over the runs since the button was pressed; null before it is.
  const [progress, setProgress] = useState<Progress | null>(null);
  const counted = useRef<WebsiteImportState>(undefined);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (pending || !state || state === counted.current) return;
    counted.current = state;
    if (state.error) return;
    setProgress((p) => ({
      checked: (p?.checked ?? 0) + (state.checked ?? 0),
      created: (p?.created ?? 0) + (state.created ?? 0),
      updated: (p?.updated ?? 0) + (state.updated ?? 0),
    }));
  }, [state, pending]);

  useEffect(() => {
    if (pending || !running) return;
    if (!state || state.error || !(state.remaining || state.searching)) {
      setRunning(false);
      return;
    }
    // Same address as before, so the run continues with the pages left.
    const data = new FormData(form.current ?? undefined);
    startTransition(() => formAction(data));
  }, [state, pending, running, formAction]);

  const busy = pending || (running && Boolean(state?.remaining || state?.searching));
  // The first result of this session tells how many pages there are; until then we're still finding them.
  const started = progress !== null && counted.current === state && !state?.error;
  return (
    <form
      ref={form}
      action={formAction}
      onSubmit={() => {
        counted.current = state;
        setProgress(null);
        setRunning(true);
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute top-2 left-2.5 size-4 text-faint" />
          <input name="websiteUrl" defaultValue={websiteUrl ?? ""} placeholder="www.youragency.be" className={`${field} pl-8`} required inputMode="url" autoComplete="url" />
        </div>
        {busy ? (
          <Button type="button" onClick={() => setRunning(false)}>
            Stop
          </Button>
        ) : (
          <Button variant="primary">{label}</Button>
        )}
      </div>
      {busy && !started && (
        <ImportProgress done={0} total={0} title="Finding your listing pages…" detail="This takes up to a minute. Keep this page open." />
      )}
      {started && progress && state && (
        <ImportProgress
          done={progress.checked}
          total={progress.checked + (state.remaining ?? 0)}
          title={
            progress.checked + (state.remaining ?? 0) > 0
              ? `${progress.checked} / ${progress.checked + (state.remaining ?? 0)} pages read`
              : state.searching
                ? "Going through your overview pages…"
                : "Everything was read recently"
          }
          detail={[
            `${state.read ?? 0} listings`,
            progress.created > 0 && `${progress.created} new`,
            progress.updated > 0 && `${progress.updated} checked`,
            state.searching && "still going through your overview pages, so more may follow",
            busy ? "keep this page open; if you leave, the nightly run reads the rest" : state.remaining || state.searching ? "stopped; the nightly run reads the rest" : "done",
          ]
            .filter(Boolean)
            .join(" · ")}
          busy={busy}
        />
      )}
      {state?.error && <p className="text-danger">{state.error}</p>}
    </form>
  );
}

/** A small ring that fills as pages are read; it spins while the total isn't known yet. */
function ImportProgress({ done, total, title, detail, busy = true }: { done: number; total: number; title: string; detail: string; busy?: boolean }) {
  const known = total > 0 || !busy;
  const share = total > 0 ? Math.min(1, done / total) : known ? 1 : 0.25;
  const r = 15;
  const length = 2 * Math.PI * r;
  return (
    <div className="mt-1 flex items-center gap-3" role="status" aria-live="polite">
      <svg viewBox="0 0 36 36" className={`size-9 shrink-0 -rotate-90 ${known ? "" : "animate-spin"}`} aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-line" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - share)}
          className={`transition-[stroke-dashoffset] duration-700 ${known && !busy && share === 1 ? "stroke-success" : "stroke-fg"}`}
        />
      </svg>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium tabular-nums">{title}</span>
          {total > 0 && <span className="text-[12px] text-faint tabular-nums">{Math.round(share * 100)}%</span>}
        </div>
        <div className="text-[12px] text-muted">{detail}</div>
      </div>
    </div>
  );
}
