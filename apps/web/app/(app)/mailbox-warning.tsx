import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Panel, StatusDot } from "@/components/ui";

type Missing = { agents: { agentId: string; name: string; reason: "not_connected" | "stopped" }[]; total: number; canConnect: boolean };

/**
 * Agents whose client emails don't leave from their own Gmail or Outlook. Their
 * emails still go out, from the inbox address, so without this nobody notices.
 */
export function MailboxWarning({ agents, canConnect }: Missing) {
  if (!canConnect || agents.length === 0) return null;
  return (
    <Panel className="mt-3">
      <div className="flex items-start gap-2 border-b border-line px-4 py-2.5">
        <StatusDot color="var(--warning)" className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">
            {agents.length === 1 ? "1 agent emails clients" : `${agents.length} agents email clients`} from the inbox address
          </h2>
          <p className="text-[12px] text-muted">Client emails should come from the agent&apos;s own mailbox. Connect Outlook or Gmail on their page.</p>
        </div>
      </div>
      <div className="divide-y divide-line">
        {agents.map((a) => (
          <Link key={a.agentId} href={`/agents/${a.agentId}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-hover/60">
            <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
            <span className="shrink-0 text-[12px] text-muted">{a.reason === "stopped" ? "Connection stopped, reconnect" : "Not connected"}</span>
            <ArrowUpRight className="size-4 shrink-0 text-muted" />
          </Link>
        ))}
      </div>
    </Panel>
  );
}
