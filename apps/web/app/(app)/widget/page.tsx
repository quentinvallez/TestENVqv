import Link from "next/link";
import { runTool, tools } from "@viewing/core";
import { Code2, ExternalLink, ListChecks, Sparkles } from "lucide-react";
import { AiPill, PageHeader, Panel } from "@/components/ui";
import { getSession, getToolContext } from "@/lib/context";
import { address } from "@/lib/format";

export default async function WidgetPage() {
  const { agency } = await getSession();
  const listings = await runTool(tools.listListings, await getToolContext(), { status: "active" });
  const first = listings[0];

  return (
    <>
      <PageHeader crumbs={[{ label: "Booking widget" }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] px-5 py-6">
          <h1 className="text-[18px] font-semibold tracking-tight">The planner on your website</h1>
          <p className="mt-1 max-w-2xl text-muted">
            On every listing, visitors see the real free times of the responsible agent, answer a few short questions and book. They can change or
            cancel themselves; the planner handles the rest.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Link href={`/demo-site/${agency.id}`} target="_blank" className="group">
              <Panel className="h-full p-4 transition-colors group-hover:border-line-strong">
                <div className="flex items-center gap-2 font-medium">
                  <ExternalLink className="size-4 text-muted" />
                  Open the demo agency website
                </div>
                <p className="mt-1 text-muted">Your listings on a sample agency site, with the widget on every listing page.</p>
              </Panel>
            </Link>
            {first && (
              <Link href={`/demo-site/${agency.id}/${first.id}?lang=fr`} target="_blank" className="group">
                <Panel className="h-full p-4 transition-colors group-hover:border-line-strong">
                  <div className="flex items-center gap-2 font-medium">
                    <ExternalLink className="size-4 text-muted" />
                    Try it in French
                  </div>
                  <p className="mt-1 text-muted">{address(first.street, first.houseNumber, first.city)} · the widget speaks NL, FR and EN.</p>
                </Panel>
              </Link>
            )}
          </div>

          <Panel className="mt-5 p-4">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <ListChecks className="size-4 text-muted" />
              Qualifying questions
            </div>
            <p className="text-muted">
              Asked after the visitor picks a time, and optional to answer. The answers show on the lead and the contact, with a hot / warm / cold
              label, so agents know who they meet.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[12px] font-medium text-muted">For sale</div>
                <ul className="mt-1 list-inside list-disc text-muted">
                  <li>Living in it or investing</li>
                  <li>Mortgage approval</li>
                  <li>Selling a current home first</li>
                  <li>When they want to buy</li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-medium text-muted">For rent</div>
                <ul className="mt-1 list-inside list-disc text-muted">
                  <li>Move-in date</li>
                  <li>Number of people</li>
                  <li>Pets</li>
                </ul>
                <p className="mt-1 text-[12px] text-faint">Kept within what Belgian anti-discrimination rules allow before a viewing.</p>
              </div>
            </div>
          </Panel>

          <Panel className="mt-5 p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
              <Code2 className="size-3.5" />
              Embed code
              <AiPill>Phase 2</AiPill>
            </div>
            <pre className="overflow-x-auto rounded-md bg-hover p-3 font-mono text-[12px] text-muted">
              {`<script src="https://cdn.viewing.app/widget.js"\n        data-agency="${agency.slug}" async></script>`}
            </pre>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-faint">
              <Sparkles className="size-3.5" />
              The script detects the listing on each page and loads the same widget you see on the demo site.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
