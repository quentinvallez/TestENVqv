import Link from "next/link";
import { aiAvailable, inboxFolders, runTool, tools, type InboxFolder } from "@viewing/core";
import { ArrowLeft, Building2, CalendarCheck2, CalendarX2, Check, CheckCheck, Flame, Inbox, RotateCcw, Sparkles } from "lucide-react";
import { ChannelMark, providerMeta, providerOf } from "@/components/channel";
import { AiPill, Avatar, Button, EmptyState, PageHeader, Pill, StatusDot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getToolContext } from "@/lib/context";
import { address, formatDateTime, formatRelative, formatTime, fullName } from "@/lib/format";
import { categoryMeta, leadStageMeta, temperatureMeta } from "@/lib/labels";
import { dismissDraftAction, redraftAction, replyAction, sendDraftAction, setStatusAction, simulateMessageAction } from "./actions";
import { DraftComposer, ReplyBox } from "./composer";
import { SimulateMessage } from "./simulate";

const folderGroups: { title?: string; folders: { id: InboxFolder; label: string; dot?: string; ai?: boolean; provider?: keyof typeof providerMeta }[] }[] = [
  {
    folders: [
      { id: "all", label: "All open" },
      { id: "priority", label: "Priority", dot: "#dc2626" },
      { id: "drafts", label: "AI drafts", ai: true },
      { id: "needs_reply", label: "Needs reply" },
    ],
  },
  {
    title: "Type",
    folders: [
      { id: "viewing_request", label: "Bookings & requests", dot: categoryMeta.viewing_request!.color },
      { id: "changes", label: "Changes & cancellations", dot: categoryMeta.reschedule!.color },
      { id: "question", label: "Questions", dot: categoryMeta.question!.color },
      { id: "offer", label: "Offers", dot: categoryMeta.offer!.color },
      { id: "feedback", label: "Feedback", dot: categoryMeta.feedback!.color },
    ],
  },
  {
    title: "Channels",
    folders: [
      { id: "outlook", label: "Outlook", provider: "outlook" },
      { id: "gmail", label: "Gmail", provider: "gmail" },
      { id: "whatsapp_business", label: "WhatsApp", provider: "whatsapp_business" },
    ],
  },
  { folders: [{ id: "done", label: "Done" }] },
];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ f?: string; c?: string }> }) {
  const params = await searchParams;
  const folder: InboxFolder = inboxFolders.includes(params.f as InboxFolder) ? (params.f as InboxFolder) : "all";
  const ctx = await getToolContext();
  const [{ items, counts }, listings] = await Promise.all([runTool(tools.listInbox, ctx, { folder }), runTool(tools.listListings, ctx, { status: "active" })]);
  const selectedId = params.c ?? null;
  const conversation = selectedId ? await runTool(tools.getConversation, ctx, { conversationId: selectedId }) : null;
  if (conversation?.unread) await runTool(tools.updateConversation, ctx, { conversationId: conversation.id, unread: false });
  const ai = aiAvailable();
  const href = (next: { f?: string; c?: string | null }) => {
    const q = new URLSearchParams();
    const f = next.f ?? folder;
    if (f !== "all") q.set("f", f);
    const c = next.c === undefined ? selectedId : next.c;
    if (c) q.set("c", c);
    return `/inbox${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Inbox" }]}
        actions={
          <>
            <span className="hidden items-center gap-1.5 text-[12px] text-muted sm:flex">
              <StatusDot color={ai ? "var(--ai)" : "var(--line-strong)"} />
              {ai ? "AI drafting on" : "Templates only · add ANTHROPIC_API_KEY for AI"}
            </span>
            <SimulateMessage action={simulateMessageAction} listings={listings.map((l) => ({ id: l.id, label: `${l.reference} · ${address(l.street, l.houseNumber, l.city)}` }))} />
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        {/* Folders */}
        <nav className="hidden w-[208px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-line px-2 py-3 lg:flex">
          {folderGroups.map((group, i) => (
            <div key={i} className="flex flex-col gap-px">
              {group.title && <div className="px-2 pb-1 text-[11px] font-medium text-faint">{group.title}</div>}
              {group.folders.map((f) => (
                <Link
                  key={f.id}
                  href={href({ f: f.id, c: null })}
                  className={cn(
                    "flex h-7 items-center gap-2 rounded-md px-2",
                    folder === f.id ? "bg-hover font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg",
                    f.ai && "text-ai",
                  )}
                >
                  {f.provider ? (
                    <ChannelMark provider={f.provider} size={14} />
                  ) : f.ai ? (
                    <Sparkles className="size-3.5" />
                  ) : f.dot ? (
                    <StatusDot color={f.dot} className="mx-[3px]" />
                  ) : (
                    <Inbox className="size-3.5" />
                  )}
                  <span className="flex-1 truncate">{f.label}</span>
                  {counts[f.id] > 0 && <span className="text-[11px] tabular-nums text-faint">{counts[f.id]}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Conversation list */}
        <section className={cn("min-w-0 flex-col border-r border-line md:w-[340px] md:shrink-0", conversation ? "hidden md:flex" : "flex flex-1 md:flex-none")}>
          <div className="flex gap-1 overflow-x-auto border-b border-line px-2 py-2 lg:hidden">
            {folderGroups.flatMap((g) => g.folders).map((f) => (
              <Link key={f.id} href={href({ f: f.id, c: null })} className={cn("shrink-0 rounded-md px-2 py-1", folder === f.id ? "bg-hover font-medium" : "text-muted")}>
                {f.label} {counts[f.id] > 0 && <span className="text-faint">{counts[f.id]}</span>}
              </Link>
            ))}
          </div>
          <div className="flex-1 divide-y divide-line overflow-y-auto">
            {items.length === 0 && <EmptyState icon={<CheckCheck className="size-5" />} title="Nothing here" description="All caught up in this folder." />}
            {items.map((c) => {
              const provider = providerOf(c.provider, c.channel);
              const name = fullName(c.contact?.firstName, c.contact?.lastName);
              return (
                <Link key={c.id} href={href({ c: c.id })} className={cn("block px-4 py-3 transition-colors hover:bg-hover/60", c.id === selectedId && "bg-hover")}>
                  <div className="flex items-center gap-2">
                    {c.unread && <span className="size-1.5 shrink-0 rounded-full bg-info" />}
                    <span className={cn("flex-1 truncate", c.unread ? "font-semibold" : "font-medium")}>{name}</span>
                    <ChannelMark provider={provider} size={14} />
                    <span className="text-[11px] text-faint tabular-nums">{c.lastMessageAt ? formatRelative(c.lastMessageAt) : ""}</span>
                  </div>
                  {c.subject && <div className="mt-0.5 truncate text-[12px]">{c.subject}</div>}
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">
                    {c.lastMessage?.direction === "outbound" && <span className="text-faint">You: </span>}
                    {c.lastMessage?.authorType === "system" && <span className="text-faint">{c.category === "booking" ? "Website: " : "Booking link: "}</span>}
                    {c.lastMessage?.body}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {c.priority === "high" && c.status !== "done" && (
                      <Pill className="border-danger/30 text-danger">
                        <Flame className="size-3" />
                        Priority
                      </Pill>
                    )}
                    {c.category && (
                      <Pill>
                        <StatusDot color={categoryMeta[c.category]?.color ?? "#a1a1aa"} className="size-1.5" />
                        {categoryMeta[c.category]?.label}
                      </Pill>
                    )}
                    {c.pendingDraft && <AiPill>Draft ready</AiPill>}
                    {c.status === "waiting" && <Pill>Waiting for client</Pill>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Thread */}
        <section className={cn("min-w-0 flex-1 flex-col", conversation ? "flex" : "hidden md:flex")}>
          {!conversation ? (
            <EmptyState icon={<Inbox className="size-5" />} title="Select a conversation" description="Every message from Outlook, Gmail and WhatsApp lands here, already read and sorted by the planner." />
          ) : (
            <Thread conversation={conversation} back={href({ c: null })} ai={ai} />
          )}
        </section>
      </div>
    </>
  );
}

type Conversation = NonNullable<Awaited<ReturnType<typeof tools.getConversation.run>>>;

function Thread({ conversation: c, back, ai }: { conversation: Conversation; back: string; ai: boolean }) {
  const provider = providerOf(c.provider, c.channel);
  const channelLabel = providerMeta[provider].label;
  const name = fullName(c.contact?.firstName, c.contact?.lastName);
  const temperature = c.lead?.qualification?.temperature;
  const draft = c.draft;
  const draftSlots = Array.isArray(draft?.input.offeredSlots) ? (draft.input.offeredSlots as string[]).map((s) => formatDateTime(new Date(s))) : [];

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3 sm:items-center sm:px-5">
        <Link href={back} className="mt-0.5 text-muted md:hidden">
          <ArrowLeft className="size-4" />
        </Link>
        <span className="hidden sm:block">
          <Avatar name={name} size={32} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {c.contact ? (
              <Link href={`/contacts/${c.contact.id}`} className="font-semibold hover:underline">
                {name}
              </Link>
            ) : (
              <span className="font-semibold">{name}</span>
            )}
            {temperature && (
              <Pill>
                <StatusDot color={temperatureMeta[temperature].color} className="size-1.5" />
                {temperatureMeta[temperature].label}
              </Pill>
            )}
            {c.lead && (
              <Pill>
                <StatusDot color={leadStageMeta[c.lead.stage].color} className="size-1.5" />
                {leadStageMeta[c.lead.stage].label}
              </Pill>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              <ChannelMark provider={provider} size={13} />
              <span className="truncate">
                {channelLabel} · {c.channel === "whatsapp" ? c.contact?.phone : c.contact?.email}
              </span>
            </span>
            {c.listing && (
              <Link href={`/listings/${c.listing.id}`} className="flex min-w-0 items-center gap-1 hover:text-fg">
                <Building2 className="size-3.5 shrink-0" />
                {c.listing.reference} · {address(c.listing.street, c.listing.houseNumber, c.listing.city)}
              </Link>
            )}
            {c.agent && <span className="hidden sm:inline">Agent: {c.agent.name}</span>}
          </div>
        </div>
        <form action={setStatusAction.bind(null, c.id, c.status === "done" ? "open" : "done")}>
          <Button size="sm" title={c.status === "done" ? "Reopen" : "Mark done"}>
            {c.status === "done" ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
            <span className="hidden sm:inline">{c.status === "done" ? "Reopen" : "Mark done"}</span>
          </Button>
        </form>
      </div>

      {/* Phones scroll messages and draft together; larger screens pin the draft at the bottom. */}
      <div className="min-h-0 flex-1 overflow-y-auto md:flex md:flex-col md:overflow-hidden">
      <div className="bg-canvas px-4 py-4 md:flex-1 md:overflow-y-auto md:px-5">
        <div className="mx-auto flex max-w-[720px] flex-col gap-3">
          {c.summary && (
            <div className="flex items-start gap-2 rounded-lg border border-ai-line bg-ai-soft px-3 py-2 text-ai">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" />
              <div>
                <span className="font-medium">{c.category ? categoryMeta[c.category]?.label : "Planner"}</span>
                {c.priority === "high" && <span className="font-medium"> · priority</span>}
                <span className="opacity-80"> · {c.summary}</span>
              </div>
            </div>
          )}

          {c.messages.map((m) => {
            const outbound = m.direction === "outbound";
            if (m.authorType === "system") {
              return (
                <div key={m.id} className="flex items-center justify-center gap-2 py-1 text-center text-[12px] text-muted">
                  {m.intent === "cancellation" ? <CalendarX2 className="size-3.5 shrink-0" /> : <CalendarCheck2 className="size-3.5 shrink-0" />}
                  <span>
                    <span className="font-medium text-fg">{name}</span> {m.body.charAt(0).toLowerCase() + m.body.slice(1)}
                  </span>
                  <span className="text-faint tabular-nums">{formatTime(m.sentAt)}</span>
                </div>
              );
            }
            if (c.channel === "email") {
              return (
                <article key={m.id} className={cn("rounded-lg border border-line bg-panel", outbound && "ml-8")}>
                  <header className="flex items-center gap-2 border-b border-line px-4 py-2 text-[12px] text-muted">
                    <span className="font-medium text-fg">{outbound ? (c.agent?.name ?? "Agency") : name}</span>
                    {m.subject && <span className="truncate">· {m.subject}</span>}
                    <span className="ml-auto shrink-0 tabular-nums">{formatDateTime(m.sentAt)}</span>
                  </header>
                  <div className="px-4 py-3 whitespace-pre-line">{m.body}</div>
                  {(m.intent || m.delivery === "simulated") && (
                    <footer className="flex items-center gap-2 px-4 pb-3">
                      {m.intent && <AiPill>{categoryMeta[m.intent]?.label ?? m.intent}</AiPill>}
                      {m.delivery === "simulated" && <span className="text-[11px] text-faint">Not delivered: Outlook/Gmail not connected yet</span>}
                    </footer>
                  )}
                </article>
              );
            }
            return (
              <div key={m.id} className={cn("flex flex-col", outbound ? "items-end" : "items-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 whitespace-pre-line", outbound ? "rounded-br-md bg-[#d9fdd3] text-[#111b21] dark:bg-[#144d37] dark:text-[#e9edef]" : "rounded-bl-md border border-line bg-panel")}>
                  {m.body}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-faint">
                  {formatTime(m.sentAt)}
                  {m.intent && <AiPill>{categoryMeta[m.intent]?.label ?? m.intent}</AiPill>}
                  {m.delivery === "simulated" && <span>not delivered · WhatsApp not connected yet</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-line bg-panel px-4 py-3 md:shrink-0 md:px-5">
        <div className="mx-auto max-w-[720px]">
          {draft && typeof draft.input.body === "string" ? (
            <DraftComposer
              key={draft.id}
              initialBody={draft.input.body}
              slots={draftSlots}
              generatedBy={draft.generatedBy}
              channelLabel={channelLabel}
              send={sendDraftAction.bind(null, draft.id)}
              dismiss={dismissDraftAction.bind(null, draft.id)}
              redraft={redraftAction.bind(null, c.id)}
              aiEnabled={ai}
            />
          ) : (
            <ReplyBox send={replyAction.bind(null, c.id)} channelLabel={channelLabel} />
          )}
        </div>
      </div>
      </div>
    </>
  );
}
