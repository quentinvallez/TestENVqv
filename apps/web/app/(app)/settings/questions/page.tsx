import Link from "next/link";
import { MAX_OPTIONS, MAX_QUESTIONS, runTool, tools } from "@viewing/core";
import { SettingsTabs } from "@/components/settings-tabs";
import { PageHeader, Panel } from "@/components/ui";
import { getSession, getToolContext } from "@/lib/context";
import { cn } from "@/lib/cn";
import { saveBookingQuestionsAction } from "../../actions";
import { QuestionsEditor } from "./editor";

const kinds = [
  { id: "sale", label: "For sale" },
  { id: "rent", label: "To rent" },
] as const;

export default async function BookingQuestionsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { isAdmin } = await getSession();
  const kind = (await searchParams).type === "rent" ? "rent" : "sale";
  const data = await runTool(tools.getBookingQuestions, await getToolContext(), {});
  const current = data[kind];

  return (
    <>
      <PageHeader crumbs={[{ label: "Settings", href: "/settings" }, { label: "Booking questions" }]} />
      <SettingsTabs active="questions" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-5 py-6 pb-24 md:pb-6">
          <h1 className="text-[18px] font-semibold tracking-tight">Booking questions</h1>
          <p className="mt-1 text-muted">
            Clients answer these in the booking widget after they pick a time. The same questions show on every listing of that kind. What they answer goes to the agent by email, into the
            viewing in the agent&apos;s Outlook or Google calendar, and onto the client&apos;s page here.
          </p>

          <div className="mt-5 inline-flex rounded-md border border-line bg-panel p-0.5" role="tablist">
            {kinds.map((k) => (
              <Link
                key={k.id}
                href={k.id === "sale" ? "/settings/questions" : "/settings/questions?type=rent"}
                role="tab"
                aria-selected={k.id === kind}
                className={cn("rounded px-3 py-1 text-[13px] transition-colors", k.id === kind ? "bg-hover font-medium text-fg" : "text-muted hover:text-fg")}
              >
                {k.label}
                <span className="ml-1.5 text-faint">{data[k.id].questions.length}</span>
              </Link>
            ))}
          </div>

          {kind === "rent" && (
            <p className="mt-3 text-[12px] text-muted">
              Before a viewing, Belgian rules don&apos;t allow asking tenants about origin, nationality, health, family plans or where their income comes from. Keep rental questions practical:
              moving date, household size, pets.
            </p>
          )}

          <div className="mt-4">
            {isAdmin ? (
              <QuestionsEditor
                key={kind}
                kind={kind}
                initial={current.questions}
                custom={current.custom}
                agencyLang={data.language}
                limits={{ questions: MAX_QUESTIONS, options: MAX_OPTIONS }}
                save={saveBookingQuestionsAction.bind(null, kind)}
              />
            ) : (
              <>
                <Panel className="px-4 py-3 text-muted">Only the agency&apos;s admins can change the booking questions.</Panel>
                <Panel className="mt-3 divide-y divide-line">
                  {current.questions.map((q, i) => (
                    <div key={q.id} className="px-4 py-3">
                      <span className="text-faint">{i + 1}.</span> {q.question[data.language] ?? Object.values(q.question)[0]}
                    </div>
                  ))}
                </Panel>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
