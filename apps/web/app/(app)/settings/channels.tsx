"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import type { WhatsAppState } from "../actions";

const field = "h-8 w-full rounded-md border border-line bg-panel px-2.5 outline-none focus:border-line-strong";

export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** The agency's own WhatsApp Business number from Meta's WhatsApp Manager. */
export function WhatsAppForm({ action }: { action: (state: WhatsAppState, form: FormData) => Promise<WhatsAppState> }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  if (!open) {
    return (
      <Button size="sm" type="button" onClick={() => setOpen(true)}>
        Connect your own number
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="displayNumber" placeholder="+32 470 12 34 56" className={field} required />
        <input name="phoneNumberId" placeholder="Phone number ID" inputMode="numeric" className={field} required />
      </div>
      <input name="accessToken" type="password" placeholder="Permanent access token (system user)" autoComplete="off" className={field} required />
      {state?.error && <p className="text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={pending}>
          {pending ? "Checking…" : "Connect"}
        </Button>
        <Button size="sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
