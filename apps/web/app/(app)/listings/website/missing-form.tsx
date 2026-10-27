"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import type { MissingListingState } from "../../actions";

const field = "h-8 w-full min-w-0 rounded-md border border-line bg-panel px-2.5 outline-none focus:border-line-strong";

/** A listing the agency sees on its site but not here: paste its link and it is read at once. */
export function MissingListingForm({ action }: { action: (state: MissingListingState, form: FormData) => Promise<MissingListingState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="url" required inputMode="url" placeholder="Link of a listing on your website" className={field} aria-label="Link of a listing on your website" />
        <Button disabled={pending}>{pending ? "Reading…" : "Add"}</Button>
      </div>
      {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
      {state?.message && (
        <p className="text-[12px] text-muted">
          {state.message}{" "}
          {state.listingId && (
            <Link href={`/listings/${state.listingId}`} className="text-fg underline underline-offset-2">
              Open the listing
            </Link>
          )}
        </p>
      )}
    </form>
  );
}
