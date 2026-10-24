import Link from "next/link";
import { notFound } from "next/navigation";
import { runTool, tools, type TimelineEntry } from "@viewing/core";
import { CalendarCheck, Mail, MessageCircle, Phone, Sparkles, UserPlus } from "lucide-react";
import { ChannelMark, providerOf } from "@/components/channel";
import { AiPill, Avatar, Button, PageHeader, Panel, Pill, StatusDot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getToolContext } from "@/lib/context";
import { address, formatDateTime, fullName } from "@/lib/format";
import { appointmentStatusMeta, categoryMeta, leadStageMeta, reasonLabel, sourceLabel, temperatureMeta } from "@/lib/labels";
import { draftFollowUpAction, suggestListingsAction } from "../../actions";

function EntryIcon({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "message" || entry.kind === "draft") {
    return <ChannelMark provider={providerOf(entry.channel, entry.channel === "whatsapp_business" ? "whatsapp" : "email")} size={20} />;
  }
  const Icon = entry.kind === "viewing" ? CalendarCheck : UserPlus;
  return (
    <span className="flex size-5 items-center justify-center rounded bg-hover text-muted">
      <Icon className="size-3" />
    </span>
  );
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getToolContext();
  const [data, recommendations] = await Promise.all([runTool(tools.getContact, ctx, { contactId: id }), runTool(tools.recommendForContact, ctx, { contactId: id })]);
  if (!data) notFound();
  const { contact, leads, appointments, timeline, qualification } = data;
  const name = fullName(contact.firstName, contact.lastName);

  // A completed viewing with nothing sent afterwards still needs a follow-up.
  const lastSentAt = Math.max(0, ...timeline.filter((e) => e.kind === "message" && e.direction === "outbound").map((e) => e.at.getTime()));
  const hasDraft = timeline.some((e) => e.kind === "draft");
  const needsFollowUp = appointments.find((a) => a.status === "completed" && a.endsAt.getTime() > lastSentAt);
  const conversationId = contact.conversations[0]?.id;

  return (
    <>
      <PageHeader crumbs={[{ label: "Contacts", href: "/contacts" }, { label: name }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1100px] gap-6 px-5 py-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Avatar name={name} size={40} />
              <div className="min-w-0">
                <h1 className="text-[20px] font-semibold tracking-tight">{name}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
                  {contact.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="size-3.5" />
                      {contact.email}
                    </span>
                  )}
                  {contact.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="size-3.5" />
                      {contact.phone}
                      {contact.whatsappOptIn && <MessageCircle className="size-3.5 text-success" aria-label="WhatsApp opt-in" />}
                    </span>
                  )}
                  {contact.language && <Pill>{contact.language.toUpperCase()}</Pill>}
                </div>
              </div>
            </div>

            {(needsFollowUp || hasDraft) && (
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-ai-line bg-ai-soft px-4 py-3 text-ai">
                <Sparkles className="size-4 shrink-0" />
                <span className="flex-1">
                  {hasDraft
                    ? "The planner has a draft waiting for this client."
                    : `Viewed ${address(needsFollowUp!.listing?.street, needsFollowUp!.listing?.houseNumber, needsFollowUp!.listing?.city)}; no follow-up sent yet.`}
                </span>
                {hasDraft && conversationId ? (
                  <Link href={`/inbox?c=${conversationId}`} className="font-medium underline-offset-2 hover:underline">
                    Review in inbox
                  </Link>
                ) : (
                  needsFollowUp && (
                    <form action={draftFollowUpAction.bind(null, needsFollowUp.id)}>
                      <Button size="sm" variant="ai">
                        Draft a personal follow-up
                      </Button>
                    </form>
                  )
                )}
              </div>
            )}

            <h2 className="mt-8 mb-3 font-medium">History</h2>
            <ol className="relative flex flex-col gap-4 border-l border-line pl-6">
              {timeline.map((entry, i) => (
                <li key={i} className="relative">
                  <span className="absolute top-0 -left-[34px]">
                    <EntryIcon entry={entry} />
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-medium", entry.ai && "text-ai")}>{entry.title}</span>
                    {entry.kind === "viewing" && entry.status && (
                      <span className="flex items-center gap-1 text-[12px] text-muted">
                        <StatusDot color={appointmentStatusMeta[entry.status as keyof typeof appointmentStatusMeta]?.color ?? "#a1a1aa"} className="size-1.5" />
                        {appointmentStatusMeta[entry.status as keyof typeof appointmentStatusMeta]?.label}
                      </span>
                    )}
                    {entry.kind === "message" && entry.status && categoryMeta[entry.status] && <AiPill>{categoryMeta[entry.status]!.label}</AiPill>}
                    {entry.kind === "draft" && <AiPill>Draft, not sent</AiPill>}
                    {entry.kind === "lead" && entry.channel && <Pill>{sourceLabel[entry.channel] ?? entry.channel}</Pill>}
                    <span className="text-[12px] text-faint tabular-nums">{formatDateTime(entry.at)}</span>
                  </div>
                  {entry.detail && (
                    <p
                      className={cn(
                        "mt-1 max-w-prose whitespace-pre-line text-muted",
                        (entry.kind === "message" || entry.kind === "draft") && "line-clamp-4 rounded-md border border-line bg-panel px-3 py-2",
                        entry.kind === "draft" && "border-ai-line",
                      )}
                    >
                      {entry.detail}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">What they told us</span>
                {qualification?.temperature && (
                  <Pill>
                    <StatusDot color={temperatureMeta[qualification.temperature].color} className="size-1.5" />
                    {temperatureMeta[qualification.temperature].label}
                  </Pill>
                )}
              </div>
              {qualification?.answers.length ? (
                <dl className="mt-3 flex flex-col gap-2">
                  {qualification.answers.map((a) => (
                    <div key={a.id}>
                      <dt className="text-[12px] text-muted">{a.question}</dt>
                      <dd>{a.answer}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-muted">No answers yet. Clients answer a few questions when they book through the widget.</p>
              )}
              <p className="mt-3 text-[11px] text-faint">Hot / warm / cold is a simple rule on these answers, not an AI judgement.</p>
            </Panel>

            <Panel className="p-4">
              <div className="mb-2 font-medium">Interested in</div>
              <ul className="flex flex-col gap-2.5">
                {leads.map((lead) => (
                  <li key={lead.id}>
                    {lead.listing ? (
                      <Link href={`/listings/${lead.listing.id}`} className="hover:underline">
                        {lead.listing.reference} · {address(lead.listing.street, lead.listing.houseNumber, lead.listing.city)}
                      </Link>
                    ) : (
                      <span>{lead.intent === "sell" ? "Selling their home (valuation)" : "General enquiry"}</span>
                    )}
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                      <StatusDot color={leadStageMeta[lead.stage].color} className="size-1.5" />
                      {leadStageMeta[lead.stage].label}
                      {lead.agent && <span>· {lead.agent.name}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            {recommendations.length > 0 && (
              <Panel className="border-ai-line p-4">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <Sparkles className="size-4 text-ai" />
                  May also like
                </div>
                <ul className="flex flex-col gap-2.5">
                  {recommendations.map((r) => (
                    <li key={r.listing.id}>
                      <Link href={`/listings/${r.listing.id}`} className="hover:underline">
                        {r.listing.reference} · {address(r.listing.street, r.listing.houseNumber, r.listing.city)}
                      </Link>
                      <div className="text-[12px] text-muted">{r.reasons.map((x) => reasonLabel[x]).join(" · ")}</div>
                    </li>
                  ))}
                </ul>
                <form action={suggestListingsAction.bind(null, contact.id)} className="mt-3">
                  <Button size="sm" variant="ai" className="w-full">
                    Draft a suggestion message
                  </Button>
                </form>
              </Panel>
            )}

            <Panel className="p-4 text-muted">
              <div className="mb-1 flex items-center gap-2 font-medium text-fg">
                <Sparkles className="size-4 text-ai" />
                Coming: AI notetaker
              </div>
              Notes from the viewing itself will feed these follow-ups, so they mention what the client actually said on site.
            </Panel>
          </aside>
        </div>
      </div>
    </>
  );
}
