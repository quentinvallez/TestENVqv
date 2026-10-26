"use client";

import { useFormStatus } from "react-dom";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <RotateCcw className="size-3.5" />
      {pending ? "Loading demo data…" : "Back to demo data"}
    </Button>
  );
}

/** Replaces the workspace with the demo data, after the user confirms. */
export function DemoReset({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const ok = window.confirm(
          "Replace everything in this workspace with the demo data? Listings, the website import, contacts, leads, viewings, conversations and drafts are deleted. Agents with a connected calendar stay.",
        );
        if (!ok) event.preventDefault();
      }}
    >
      <Submit />
    </form>
  );
}
