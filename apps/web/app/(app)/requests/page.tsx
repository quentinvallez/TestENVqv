import Link from "next/link";
import { requestStages, runTool, tools, type RequestItem, type RequestStage } from "@viewing/core";
import { Building2, CheckCheck, Clock } from "lucide-react";
import { leadOrigin, LeadSourcePill } from "@/components/lead-source";
import { Avatar, EmptyState, PageHeader, Pill, StatusDot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getToolContext } from "@/lib/context";
import { address, formatDay, formatRelative, formatTime } from "@/lib/format";
import { requestReasonLabel, requestStageMeta, sourceLabel } from "@/lib/labels";
import { simulateMessageAction } from "./actions";
import { SimulateMessage } from "./simulate";

/** The board's columns; closed requests sit behind their own tab. */
const columns: RequestStage[] = ["needs_you", "contacted", "not_planned", "planned", "visited"];

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const params = await searchParams;
  const ctx = await getToolContext();
  const [{ items, counts }, listings] = await Promise.all([runTool(tools.listRequests, ctx, {}), runTool(tools.listListings, ctx, { status: "active" })]);
  const stage: RequestStage | null = requestStages.includes(params.stage as RequestStage) ? (params.stage as RequestStage) : null;
  // Phones show one stage at a time: the one asked for, else the first that needs attention.
  const phoneStage = stage ?? (counts.needs_you ? "needs_you" : "contacted");
  const showClosed = stage === "closed";
  const href = (s: RequestStage | null) => (s ? `/requests?stage=${s}` : "/requests");

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Viewing requests" }]}
        actions={
          <>
            <Link
              href={showClosed ? href(null) : href("closed")}
              className={cn("hidden h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] md:flex", showClosed ? "bg-hover font-medium" : "text-muted hover:bg-hover hover:text-fg")}
            >
              <StatusDot color={requestStageMeta.closed.color} />
              {showClosed ? "Back to the board" : `Closed ${counts.closed}`}
            </Link>
            <SimulateMessage action={simulateMessageAction} listings={listings.map((l) => ({ id: l.id, label: `${l.reference} · ${address(l.street, l.houseNumber, l.city)}` }))} />
          </>
        }
      />

      {/* Phones: one stage at a time, as a list. */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-2">
          {[...columns, "closed" as const].map((s) => (
            <Link
              key={s}
              href={href(s)}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5", phoneStage === s ? "bg-primary text-primary-fg" : "text-muted")}
            >
              <StatusDot color={requestStageMeta[s].color} />
              {requestStageMeta[s].label}
              <span className="tabular-nums opacity-70">{counts[s]}</span>
            </Link>
          ))}
        </div>
        <p className="shrink-0 px-4 pt-3 text-[12px] text-muted">{requestStageMeta[phoneStage].hint}.</p>
        <ul className="flex-1 overflow-y-auto px-3 py-2">
          {items.filter((i) => i.stage === phoneStage).length === 0 && <EmptyStage stage={phoneStage} />}
          {items
            .filter((i) => i.stage === phoneStage)
            .map((item) => (
              <li key={item.id} className="pb-2">
                <RequestCard item={item} />
              </li>
            ))}
        </ul>
      </div>

      {/* Larger screens: the whole flow side by side, or the closed requests. */}
      <div className="hidden min-h-0 flex-1 overflow-x-auto bg-canvas md:flex">
        {showClosed ? (
          <div className="mx-auto w-full max-w-[760px] px-5 py-5">
            <h2 className="mb-1 font-medium">Closed in the last 30 days</h2>
            <p className="mb-4 text-muted">No booking after the reminder, marked not interested, or done. Open one to start again.</p>
            <div className="grid grid-cols-2 gap-2">
              {items.filter((i) => i.stage === "closed").map((item) => (
                <RequestCard key={item.id} item={item} />
              ))}
            </div>
            {counts.closed === 0 && <EmptyStage stage="closed" />}
          </div>
        ) : (
          <div className="flex w-full gap-3 p-3">
            {columns.map((s) => {
              const cards = items.filter((i) => i.stage === s);
              return (
                <section key={s} className="flex min-w-[208px] flex-1 flex-col">
                  <header className="px-1.5 pb-2">
                    <div className="flex h-7 items-center gap-2">
                      <StatusDot color={requestStageMeta[s].color} />
                      <span className="font-medium">{requestStageMeta[s].label}</span>
                      <span className="text-faint tabular-nums">{cards.length}</span>
                    </div>
                    <p className="text-[12px] leading-4 text-faint">{requestStageMeta[s].hint}</p>
                  </header>
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
                    {cards.map((item) => (
                      <RequestCard key={item.id} item={item} />
                    ))}
                    {cards.length === 0 && <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-faint">Nothing here</div>}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function EmptyStage({ stage }: { stage: RequestStage }) {
  const text: Record<RequestStage, string> = {
    needs_you: "Every request is on its way. Nothing for you to do.",
    contacted: "No one is waiting on their booking link.",
    not_planned: "Everyone who got a link has booked.",
    planned: "No viewings planned yet.",
    visited: "No viewings took place in the last weeks.",
    closed: "Nothing closed in the last 30 days.",
  };
  return <EmptyState icon={<CheckCheck className="size-5" />} title={requestStageMeta[stage].label} description={text[stage]} />;
}

/** What the card says about where the request stands. */
function statusLine(item: RequestItem): { text: string; tone?: "danger" | "muted" } {
  switch (item.stage) {
    case "needs_you":
      return { text: item.draft && item.reason === "draft" ? item.draft.summary : requestReasonLabel[item.reason ?? "not_contacted"]!, tone: "danger" };
    case "contacted":
      return { text: item.invitedAt ? `Booking link sent ${formatRelative(item.invitedAt)}` : "Contacted by phone" };
    case "not_planned":
      return {
        text: item.remindedAt
          ? `Reminder ${item.reminders} of 2 sent ${formatRelative(item.remindedAt)}`
          : item.invitedAt
            ? `Link sent ${formatRelative(item.invitedAt)} · reminder on its way`
            : "No booking yet",
      };
    case "planned":
    case "visited":
      return item.viewing
        ? { text: `${formatDay(item.viewing.startsAt)} · ${formatTime(item.viewing.startsAt)}${item.viewing.agentName ? ` · ${item.viewing.agentName.split(" ")[0]}` : ""}` }
        : { text: item.stage === "planned" ? "Viewing booked" : "Visited" };
    case "closed":
      return { text: requestReasonLabel[item.reason ?? "no_response"]!, tone: "muted" };
  }
}

function RequestCard({ item }: { item: RequestItem }) {
  const origin = leadOrigin(item.source);
  const status = statusLine(item);
  return (
    <Link href={`/requests/${item.id}`} className="block rounded-lg border border-line bg-panel p-3 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <span className="truncate font-medium">{item.contact?.name ?? "Unknown"}</span>
        {origin ? (
          <LeadSourcePill origin={origin} className="shrink-0" />
        ) : item.source ? (
          <Pill className="shrink-0">{sourceLabel[item.source] ?? item.source}</Pill>
        ) : item.kind === "message" ? (
          <Pill className="shrink-0">Message</Pill>
        ) : null}
      </div>
      {item.listing && (
        <div className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-muted">
          <Building2 className="size-3.5 shrink-0" />
          <span className="truncate">
            {item.listing.reference} · {address(item.listing.street, item.listing.houseNumber, item.listing.city)}
          </span>
        </div>
      )}
      <div className={cn("mt-2 flex items-start gap-1.5 text-[12px]", status.tone === "danger" ? "text-danger" : status.tone === "muted" ? "text-muted" : "text-fg")}>
        <StatusDot color={requestStageMeta[item.stage].color} className="mt-[5px] size-1.5 shrink-0" />
        <span className="line-clamp-2">{status.text}</span>
      </div>
      {item.stage === "needs_you" && item.message && <p className="mt-1.5 line-clamp-2 text-[12px] text-muted">“{item.message}”</p>}
      <footer className="mt-2.5 flex items-center justify-between text-[12px] text-faint">
        <span className="flex items-center gap-1" title="When the request came in">
          <Clock className="size-3.5" />
          {formatRelative(item.createdAt)}
        </span>
        {item.agent && <Avatar name={item.agent.name} color={item.agent.color} size={18} />}
      </footer>
    </Link>
  );
}
