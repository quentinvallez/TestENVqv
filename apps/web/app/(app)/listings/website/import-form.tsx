"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui";
import type { WebsiteImportState } from "../../actions";

const field = "h-8 w-full min-w-0 rounded-md border border-line bg-panel px-2.5 outline-none focus:border-line-strong";

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
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (pending || !running) return;
    if (!state || state.error || !state.remaining) {
      setRunning(false);
      return;
    }
    // Same address as before, so the run continues with the pages left.
    const data = new FormData(form.current ?? undefined);
    startTransition(() => formAction(data));
  }, [state, pending, running, formAction]);

  const busy = pending || (running && Boolean(state?.remaining));
  return (
    <form ref={form} action={formAction} onSubmit={() => setRunning(true)} className="flex flex-col gap-2">
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
      {busy && (
        <p className="text-[12px] text-muted">
          Reading your website…
          {state?.pages ? ` ${state.read} listings read, ${state.remaining} pages to go.` : " Finding your listing pages first."} Keep this page open; if you
          leave, the nightly run reads the rest.
        </p>
      )}
      {!busy && state && !state.error && <p className="text-[12px] text-muted">{state.remaining ? `Stopped with ${state.remaining} pages to go.` : `Done: ${state.read} listings read.`}</p>}
      {state?.error && <p className="text-danger">{state.error}</p>}
    </form>
  );
}
