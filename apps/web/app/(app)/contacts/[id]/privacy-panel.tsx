"use client";

import { useState } from "react";
import { Download, Lock } from "lucide-react";
import { Button, Panel } from "@/components/ui";

/** Export a client's data, and (admins) erase them, with a second step instead of a browser dialog. */
export function PrivacyPanel({ contactId, isAdmin, upcoming, inDeal, erase }: { contactId: string; isAdmin: boolean; upcoming: number; inDeal: boolean; erase: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <Panel className="p-4">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <Lock className="size-4 text-muted" />
        Privacy
      </div>
      <p className="text-muted">When the client asks for a copy of their data or to be forgotten.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`/api/contacts/${contactId}/export`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 font-medium hover:bg-hover">
          <Download className="size-3.5" />
          Download their data
        </a>
        {isAdmin && !confirming && (
          <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
            Erase client…
          </Button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/5 p-3">
          <p className="font-medium text-danger">Erase this client for good?</p>
          <ul className="mt-1 list-disc pl-4 text-muted">
            <li>Their details, interests, messages, drafts and valuations are deleted. This can&apos;t be undone.</li>
            {upcoming > 0 && <li>{upcoming === 1 ? "Their upcoming viewing is cancelled" : `Their ${upcoming} upcoming viewings are cancelled`}, without a message to them.</li>}
            <li>Past viewings stay in the agenda without their name.</li>
            {inDeal && <li>They made an offer or bought or rented. You may have to keep their details for the notary file or anti-money-laundering rules; check before erasing.</li>}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                await erase();
              }}
            >
              {pending ? "Erasing…" : "Erase for good"}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
