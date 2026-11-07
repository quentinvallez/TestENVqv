"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ExternalLink, ScanEye } from "lucide-react";
import { Button } from "@/components/ui";
import type { PreviewState } from "../actions";

/** The prospect's website, and the button that reads it (up to a minute) and makes the preview link. */
export function PreviewForm({ action }: { action: (state: PreviewState, form: FormData) => Promise<PreviewState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="website"
          required
          placeholder="www.agency.be"
          autoComplete="off"
          inputMode="url"
          className="h-8 w-full min-w-0 rounded-md border border-line bg-panel px-2.5 outline-none focus:border-line-strong"
        />
        <Button variant="primary" disabled={pending} className="flex-none">
          <ScanEye className="size-3.5" />
          {pending ? "Reading the website…" : "Make preview"}
        </Button>
      </div>
      {pending && <p className="text-[12px] text-muted">We read the home page and a few listings at the pace the site asks. This takes up to a minute.</p>}
      {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
      {state?.token && !pending && (
        <p className="flex items-center gap-1.5 text-[12px]">
          Ready.
          <Link href={`/preview/${state.token}?own=1`} target="_blank" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
            Open the preview <ExternalLink className="size-3" />
          </Link>
        </p>
      )}
    </form>
  );
}
