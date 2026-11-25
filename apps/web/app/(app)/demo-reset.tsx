"use client";

import { useFormStatus } from "react-dom";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

function Submit() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <Button type="submit" disabled={pending}>
      <RotateCcw className="size-3.5" />
      {pending ? t("Loading demo data…") : t("Back to demo data")}
    </Button>
  );
}

/** Replaces the workspace with the demo data, after the user confirms. */
export function DemoReset({ action }: { action: () => Promise<void> }) {
  const t = useT();
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const ok = window.confirm(
          t("Replace everything in this workspace with the demo data? Listings, the website import, contacts, leads, viewings, conversations and drafts are deleted. Agents with a connected calendar stay."),
        );
        if (!ok) event.preventDefault();
      }}
    >
      <Submit />
    </form>
  );
}
