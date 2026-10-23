import { notFound } from "next/navigation";
import { runTool, tools } from "@viewing/core";
import { CalendarPlus } from "lucide-react";
import { Avatar, PageHeader, Panel, StatusDot } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { formatDay, formatTime } from "@/lib/format";
import { saveAvailabilityAction } from "../../actions";
import { AvailabilityForm } from "./availability-form";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getToolContext();
  const availability = await runTool(tools.getAgentAvailability, ctx, { agentId: id }).catch(() => null);
  if (!availability) notFound();
  const { agent, workingHours } = availability;
  const { slots } = await runTool(tools.availableSlots, ctx, { agentId: id, days: 7 });

  return (
    <>
      <PageHeader crumbs={[{ label: "Agents", href: "/agents" }, { label: agent.name }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1000px] gap-6 px-5 py-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <div className="mb-6 flex items-center gap-3">
              <Avatar name={agent.name} color={agent.color} size={36} />
              <div>
                <h1 className="text-[18px] font-semibold tracking-tight">{agent.name}</h1>
                <p className="text-muted">{agent.email}</p>
              </div>
            </div>
            <h2 className="mb-1 font-medium">Working hours for viewings</h2>
            <p className="mb-3 text-muted">Clients can only book inside these hours, never over existing appointments or calendar events.</p>
            <AvailabilityForm
              workingHours={workingHours}
              slotMinutes={agent.slotMinutes}
              bufferMinutes={agent.bufferMinutes}
              action={saveAvailabilityAction.bind(null, agent.id)}
            />
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <Panel className="p-4">
              <div className="flex items-center gap-2 font-medium">
                <CalendarPlus className="size-4 text-muted" />
                Calendar
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-muted">
                <StatusDot color="var(--line-strong)" />
                Google / Outlook not connected yet
              </p>
              <p className="mt-2 text-[12px] text-faint">Connecting arrives once the Google and Microsoft apps are registered.</p>
            </Panel>
            <Panel className="p-4">
              <div className="font-medium">Next free times</div>
              <ul className="mt-2 flex flex-col gap-1 text-muted tabular-nums">
                {slots.length === 0 && <li>No free times in the next 7 days.</li>}
                {slots.slice(0, 8).map((s) => (
                  <li key={s.start.toISOString()}>
                    {formatDay(s.start)} · {formatTime(s.start)}
                  </li>
                ))}
              </ul>
            </Panel>
          </aside>
        </div>
      </div>
    </>
  );
}
