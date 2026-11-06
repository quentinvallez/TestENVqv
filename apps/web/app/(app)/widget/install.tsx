"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { Button } from "@/components/ui";
import { developerEmail, guideFor, installGuides } from "@/lib/install-guides";

/**
 * Step 2 of setup: the one line for the agency's website, ready to copy or to
 * mail to whoever maintains the site, with the steps for the system the site
 * is built with (detected from its home page) and the other common ones.
 */
export function Install({ snippet, agencyName, builder }: { snippet: string; agencyName: string; builder: string | null }) {
  const [copied, setCopied] = useState(false);
  const detected = builder ? guideFor(builder) : null;
  const email = developerEmail(snippet, agencyName, builder);
  const mailto = `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  const others = installGuides.filter((g) => g.id !== detected?.id);

  return (
    <div className="flex flex-col gap-3">
      <pre className="overflow-x-auto rounded-md bg-hover p-3 font-mono text-[12px] whitespace-pre-wrap break-all text-fg">{snippet}</pre>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          onClick={async () => {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy the line"}
        </Button>
        <a href={mailto} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-3 font-medium hover:border-line-strong">
          <Mail className="size-3.5" />
          Send to my web developer
        </a>
      </div>

      {detected && (
        <div className="rounded-md border border-line p-3">
          <div className="font-medium">
            Your site looks built with {detected.name}
            {detected.who === "supplier" && <span className="font-normal text-muted"> · they add the line for you</span>}
          </div>
          <Steps steps={detected.steps} />
        </div>
      )}

      <div className="rounded-md border border-line">
        <div className="border-b border-line px-3 py-2 text-[12px] text-muted">{detected ? "Built with something else?" : "Where to paste it"}</div>
        {others.map((guide) => (
          <details key={guide.id} className="group border-b border-line last:border-b-0">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 hover:bg-hover">
              <span>{guide.name}</span>
              <span className="text-[12px] text-faint group-open:hidden">{guide.who === "supplier" ? "Ask them" : "Do it yourself"}</span>
            </summary>
            <div className="px-3 pb-3">
              <Steps steps={guide.steps} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-1.5 list-inside list-decimal space-y-1 text-muted">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}
