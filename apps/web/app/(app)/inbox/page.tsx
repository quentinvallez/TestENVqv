import { runTool, tools } from "@viewing/core";
import { Check, Inbox, Mail, MessageCircle, MessageSquareText, Sparkles, X } from "lucide-react";
import { AiPill, Button, EmptyState, PageHeader, Panel, Pill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getToolContext } from "@/lib/context";
import { formatRelative, formatTime, fullName } from "@/lib/format";
import { decideProposalAction } from "../actions";

const channelIcon = { email: Mail, whatsapp: MessageCircle, sms: MessageSquareText };

export default async function InboxPage() {
  const ctx = await getToolContext();
  const [proposals, conversations] = await Promise.all([runTool(tools.listProposals, ctx, {}), runTool(tools.listConversations, ctx, {})]);

  return (
    <>
      <PageHeader crumbs={[{ label: "Inbox" }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] px-5 py-6">
          <h2 className="mb-2 flex items-center gap-2 font-medium">
            <Sparkles className="size-4 text-ai" />
            Waiting for your decision
          </h2>
          {proposals.length === 0 ? (
            <Panel className="px-4 py-6 text-center text-muted">Nothing to approve. The planner handles routine work on its own.</Panel>
          ) : (
            <div className="flex flex-col gap-2">
              {proposals.map((p) => (
                <Panel key={p.id} className="border-ai-line p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <AiPill>Planner</AiPill>
                        <span className="text-[12px] text-faint">{formatRelative(p.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-[14px] font-medium">{p.summary}</p>
                      {p.reasoning && <p className="mt-1 text-muted">{p.reasoning}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <form action={decideProposalAction.bind(null, p.id, "approved")}>
                      <Button variant="primary" size="sm">
                        <Check className="size-3.5" />
                        Approve
                      </Button>
                    </form>
                    <form action={decideProposalAction.bind(null, p.id, "rejected")}>
                      <Button size="sm">
                        <X className="size-3.5" />
                        Dismiss
                      </Button>
                    </form>
                  </div>
                </Panel>
              ))}
            </div>
          )}

          <h2 className="mt-8 mb-2 font-medium">Conversations</h2>
          {conversations.length === 0 ? (
            <Panel>
              <EmptyState icon={<Inbox className="size-5" />} title="No conversations yet" description="Email, WhatsApp and SMS replies from clients land here, already read and sorted by the planner." />
            </Panel>
          ) : (
            <div className="flex flex-col gap-2">
              {conversations.map((c) => {
                const Icon = channelIcon[c.channel];
                return (
                  <Panel key={c.id} className="p-4">
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 text-muted" />
                      <span className="font-medium">{fullName(c.firstName, c.lastName)}</span>
                      <Pill>{c.channel === "whatsapp" ? "WhatsApp" : c.channel.toUpperCase()}</Pill>
                      {c.lastMessageAt && <span className="ml-auto text-[12px] text-faint">{formatRelative(c.lastMessageAt)}</span>}
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      {c.messages.map((m) => (
                        <div key={m.id} className={cn("flex flex-col", m.direction === "outbound" ? "items-end" : "items-start")}>
                          <div
                            className={cn(
                              "max-w-[80%] rounded-lg px-3 py-2",
                              m.direction === "outbound" ? "bg-hover" : "border border-line bg-panel",
                            )}
                          >
                            {m.body}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-faint">
                            {formatTime(m.sentAt)}
                            {m.intent && <AiPill>Intent: {m.intent}</AiPill>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
