import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Avatar, Panel, StatusDot } from "@/components/ui";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";

type Missing = "login" | "mailbox" | "calendar";
type Agent = { agentId: string; name: string; color: string | null; invited: boolean; missing: Missing[] };

function describe(t: T, agent: Agent) {
  const parts: string[] = [];
  if (agent.missing.includes("login")) parts.push(agent.invited ? t("Invited, never logged in") : t("No login"));
  const mailbox = agent.missing.includes("mailbox");
  const calendar = agent.missing.includes("calendar");
  if (mailbox && calendar) parts.push(t("No mailbox or calendar connected"));
  else if (mailbox) parts.push(t("No mailbox connected"));
  else if (calendar) parts.push(t("No calendar connected"));
  return parts.join(" · ");
}

/**
 * Agents who aren't fully set up, for admins: without a login, their own
 * Outlook/Gmail or their calendar, viewings can't be planned around them and
 * client emails leave from the inbox address instead.
 */
export async function NotConnected({ agents }: { agents: Agent[] }) {
  if (agents.length === 0) return null;
  const t = await getT();
  return (
    <Panel className="mt-3">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <StatusDot color="var(--warning)" />
        <h2 className="flex-1 font-medium">{t("Who's not connected")}</h2>
        <span className="hidden text-[12px] text-muted sm:inline">{t("Invite them or connect Outlook or Gmail on their page")}</span>
      </div>
      <div className="divide-y divide-line">
        {agents.map((a) => (
          <Link key={a.agentId} href={`/agents/${a.agentId}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-hover/60">
            <Avatar name={a.name} color={a.color} />
            <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
              <div className="truncate font-medium">{a.name}</div>
              <div className="truncate text-[12px] text-muted sm:ml-auto">{describe(t, a)}</div>
            </div>
            <ArrowUpRight className="size-4 shrink-0 text-muted" />
          </Link>
        ))}
      </div>
    </Panel>
  );
}
