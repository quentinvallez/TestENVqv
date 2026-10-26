"use client";

import { useActionState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui";
import type { WebsiteImportState } from "../../actions";

const field = "h-8 w-full min-w-0 rounded-md border border-line bg-panel px-2.5 outline-none focus:border-line-strong";

/** The agency's website address and the button that reads it. */
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
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute top-2 left-2.5 size-4 text-faint" />
          <input name="websiteUrl" defaultValue={websiteUrl ?? ""} placeholder="www.youragency.be" className={`${field} pl-8`} required inputMode="url" autoComplete="url" />
        </div>
        <Button variant="primary" disabled={pending}>
          {pending ? "Reading your website…" : label}
        </Button>
      </div>
      {pending && <p className="text-[12px] text-muted">This takes up to a minute. On large sites the nightly run reads the rest.</p>}
      {state?.error && <p className="text-danger">{state.error}</p>}
    </form>
  );
}
