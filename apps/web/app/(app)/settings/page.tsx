import { db, eq, schema } from "@viewing/db";
import { Palette, ShieldCheck, Sparkles } from "lucide-react";
import { AiPill, PageHeader, Panel, Pill } from "@/components/ui";
import { getSession } from "@/lib/context";

const capabilities = [
  ["Reply to new portal leads with a booking link", "act"],
  ["Send confirmations and reminders", "act"],
  ["Handle cancellations and reschedules from replies", "suggest"],
  ["Reassign a lead to another agent", "suggest"],
] as const;

const autonomyLabel = { suggest: "Ask me first", act_and_notify: "Do it and tell me", act: "Do it" };

export default async function SettingsPage() {
  const { agency } = await getSession();
  const settings = await db.query.agencySettings.findFirst({ where: eq(schema.agencySettings.agencyId, agency.id) });

  return (
    <>
      <PageHeader crumbs={[{ label: "Settings" }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-5 py-6">
          <section>
            <h2 className="mb-2 font-medium">Agency</h2>
            <Panel className="divide-y divide-line">
              {[
                ["Name", agency.name],
                ["Website", settings?.websiteUrl ?? "Not set"],
                ["Default language", (settings?.defaultLanguage ?? "nl").toUpperCase()],
                ["Time zone", settings?.timezone ?? "Europe/Brussels"],
                ["Data location", "EU · Frankfurt"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-muted">{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </Panel>
          </section>

          <section>
            <h2 className="mb-2 flex items-center gap-2 font-medium">
              <Palette className="size-4 text-muted" />
              Branding
            </h2>
            <Panel className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-muted">Logo and colours are detected from your website and used in the widget and messages.</span>
              <AiPill>Phase 2</AiPill>
            </Panel>
          </section>

          <section>
            <h2 className="mb-1 flex items-center gap-2 font-medium">
              <Sparkles className="size-4 text-ai" />
              Agent autonomy
            </h2>
            <p className="mb-2 text-muted">Choose what the planner may do on its own. Anything set to “Ask me first” lands in your inbox.</p>
            <Panel className="divide-y divide-line">
              {capabilities.map(([label, level]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span>{label}</span>
                  <Pill className={level === "act" ? "border-ai-line bg-ai-soft text-ai" : undefined}>{autonomyLabel[level]}</Pill>
                </div>
              ))}
            </Panel>
          </section>

          <section>
            <h2 className="mb-2 flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4 text-muted" />
              Privacy
            </h2>
            <Panel className="px-4 py-3 text-muted">
              All agency and client data is stored in the EU. Every action by people and AI agents is recorded in the activity log.
            </Panel>
          </section>
        </div>
      </div>
    </>
  );
}
