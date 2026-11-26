import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { aiAvailable, needsPerson, ownMessageDraft, runTool, tools, type RequestItem } from "@viewing/core";
import { Building2, CalendarPlus, Check, Mail, Phone, RotateCcw, Send, X } from "lucide-react";
import { BookingAnswers } from "@/components/booking-answers";
import { leadOrigin, LeadSourcePill } from "@/components/lead-source";
import { Button, PageHeader, Panel, Pill, StatusDot } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { address } from "@/lib/format";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requestReasonLabel, requestStageMeta, sourceLabel } from "@/lib/labels";
import { dismissDraftAction, markRequestAction, redraftAction, sendDraftAction } from "../actions";
import { DraftComposer } from "../composer";
import { Timeline } from "../timeline";

type Conversation = NonNullable<Awaited<ReturnType<typeof tools.getConversation.run>>>;

/** What a person should do, in a sentence, per reason the request waits. */
const needsYouText: Record<string, (t: T, name: string) => string> = {
  draft: (t) => t("This message goes out after your OK (you set it to “Ask me first” in Settings). Check it and send it."),
  question: (t, name) => t("{name} asked a question without asking to visit, so no booking link went out. Answer from your own mailbox, then mark it as handled.", { name }),
  phone_only: (t, name) => t("{name} left no email address, so nothing went out automatically. Call them to plan the viewing, or book it for them.", { name }),
  listing_unknown: (t) => t("We couldn't tell which listing this is about, so no booking link went out. Contact them yourself."),
  listing_unavailable: (t) => t("The listing is under option, sold or off the website, so no booking link went out."),
  not_delivered: (t) => t("Our last message didn't reach them. Call them, or email them from your own mailbox."),
  not_contacted: (t) => t("Nothing went out automatically. Contact them yourself."),
};

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getToolContext();
  const t = await getT();
  let item = await runTool(tools.getRequest, ctx, { id });

  // An old link to a conversation: show the request it belongs to.
  if (!item && id.startsWith("cnv")) {
    const conversation = await runTool(tools.getConversation, ctx, { conversationId: id });
    if (!conversation) notFound();
    if (conversation.lead && conversation.lead.id !== id) {
      const owner = await runTool(tools.getRequest, ctx, { id: conversation.lead.id });
      if (owner) redirect(`/requests/${owner.id}`);
    }
    if (conversation.contactId) redirect(`/contacts/${conversation.contactId}`);
    notFound();
  }
  if (!item) {
    // Off the board (closed long ago): the client's page still has everything.
    const lead = (await runTool(tools.listLeads, ctx, {})).find((l) => l.id === id);
    if (lead) redirect(`/contacts/${lead.contactId}`);
    notFound();
  }
  item = item as RequestItem;

  const conversationIds = await runTool(tools.requestConversationIds, ctx, { id });
  const conversations = (await Promise.all(conversationIds.map((conversationId) => runTool(tools.getConversation, ctx, { conversationId })))).filter(
    (c): c is Conversation => Boolean(c),
  );
  for (const c of conversations) if (c.unread) await runTool(tools.updateConversation, ctx, { conversationId: c.id, unread: false });
  // Only drafts of our own messages; answers to what clients write are given from the agent's own mailbox.
  const withDraft = conversations.find((c) => c.draft && ownMessageDraft(c.draft));
  const name = item.contact?.name ?? t("Unknown");
  const firstName = name.split(" ")[0]!;
  const origin = leadOrigin(item.source);
  const meta = requestStageMeta[item.stage];
  const agentName = item.agent?.name ?? conversations.find((c) => c.agent)?.agent?.name ?? null;
  const listingLine = item.listing ? `${item.listing.reference} · ${address(item.listing.street, item.listing.houseNumber, item.listing.city)}` : null;
  const mailto = item.contact?.email
    ? `mailto:${item.contact.email}?subject=${encodeURIComponent(item.listing ? `${address(item.listing.street, item.listing.houseNumber, item.listing.city)}` : t("Your viewing request"))}`
    : null;
  const bookHref = `/appointments/new?${new URLSearchParams({ ...(item.listing && { listingId: item.listing.id }), ...(item.contact && { contactId: item.contact.id }), ...(item.agent && { agentId: item.agent.id }) })}`;
  const lead = item.kind === "lead";

  return (
    <>
      <PageHeader crumbs={[{ label: t("Viewing requests"), href: "/requests" }, { label: name }]} />
      <div className="flex-1 overflow-y-auto bg-canvas">
        <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-4 py-5 md:px-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-semibold tracking-tight">
                {item.contact ? (
                  <Link href={`/contacts/${item.contact.id}`} className="hover:underline">
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </h1>
              {origin ? <LeadSourcePill origin={origin} prefix={t("Via")} /> : item.source && <Pill>{sourceLabel[item.source] ? t(sourceLabel[item.source]!) : item.source}</Pill>}
              <Pill>
                <StatusDot color={meta.color} className="size-1.5" />
                {t(meta.label)}
              </Pill>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              {item.listing && listingLine && (
                <Link href={`/listings/${item.listing.id}`} className="flex min-w-0 items-center gap-1 hover:text-fg">
                  <Building2 className="size-3.5 shrink-0" />
                  <span className="truncate">{listingLine}</span>
                </Link>
              )}
              {agentName && <span>{t("Agent: {name}", { name: agentName })}</span>}
              <span>{t("Came in {when}", { when: t.relative(item.createdAt) })}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted">
              {item.contact?.email && <span className="break-all">{item.contact.email}</span>}
              {item.contact?.phone && <span>{item.contact.phone}</span>}
            </div>
          </div>

          <Panel className="p-4">
            <NextStep t={t} item={item} firstName={firstName} />
            {needsPerson(item) && item.message && item.kind === "lead" && (
              <blockquote className="mt-3 border-l-2 border-line pl-3 whitespace-pre-line text-muted">{item.message}</blockquote>
            )}

            {withDraft?.draft && typeof withDraft.draft.input.body === "string" && item.stage !== "closed" && (
              <div className="mt-4">
                <DraftComposer
                  key={withDraft.draft.id}
                  initialBody={withDraft.draft.input.body}
                  slots={Array.isArray(withDraft.draft.input.offeredSlots) ? (withDraft.draft.input.offeredSlots as string[]).map((s) => t.dateTime(new Date(s))) : []}
                  generatedBy={withDraft.draft.generatedBy}
                  kind={withDraft.draft.kind}
                  channelLabel={withDraft.route.ready ? withDraft.route.via : withDraft.channel === "whatsapp" ? "WhatsApp" : t("email")}
                  ready={withDraft.route.ready}
                  send={sendDraftAction.bind(null, withDraft.draft.id)}
                  dismiss={dismissDraftAction.bind(null, withDraft.draft.id)}
                  redraft={redraftAction.bind(null, withDraft.id)}
                  aiEnabled={aiAvailable()}
                />
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {item.contact?.phone && (
                <a href={`tel:${item.contact.phone.replace(/\s/g, "")}`} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line bg-panel px-3 font-medium hover:bg-hover sm:h-8">
                  <Phone className="size-3.5" />
                  {t("Call")}
                </a>
              )}
              {mailto && (
                <a href={mailto} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line bg-panel px-3 font-medium hover:bg-hover sm:h-8">
                  <Mail className="size-3.5" />
                  {t("Email from my mailbox")}
                </a>
              )}
              {item.listing && item.contact && item.stage !== "planned" && item.stage !== "closed" && (
                <Link href={bookHref} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line bg-panel px-3 font-medium hover:bg-hover sm:h-8">
                  <CalendarPlus className="size-3.5" />
                  {t("Book a viewing")}
                </Link>
              )}
              {needsPerson(item) && (
                <form action={markRequestAction.bind(null, item.id, "handled")}>
                  <Button className="h-10 sm:h-8">
                    <Check className="size-3.5" />
                    {t("Mark as handled")}
                  </Button>
                </form>
              )}
              {lead && item.stage !== "closed" && item.stage !== "planned" && (
                <form action={markRequestAction.bind(null, item.id, "not_interested")}>
                  <Button variant="ghost" className="h-10 sm:h-8">
                    <X className="size-3.5" />
                    {t("Not interested")}
                  </Button>
                </form>
              )}
              {lead && item.stage === "closed" && item.reason === "not_interested" && (
                <form action={markRequestAction.bind(null, item.id, "reopen")}>
                  <Button className="h-10 sm:h-8">
                    <RotateCcw className="size-3.5" />
                    {t("Open again")}
                  </Button>
                </form>
              )}
            </div>
          </Panel>

          {item.answers.length > 0 && (
            <Panel className="p-4">
              <h2 className="font-medium">{t("What {name} answered when booking", { name: firstName })}</h2>
              <BookingAnswers answers={item.answers} className="mt-3" />
              <p className="mt-3 text-[11px] text-faint">
                {agentName
                  ? t("Also in the booking email to {agent} and in the viewing in their Outlook or Google calendar.", { agent: agentName.split(" ")[0]! })
                  : t("Also in the agent's booking email and in the viewing in their Outlook or Google calendar.")}
              </p>
            </Panel>
          )}

          <section>
            <h2 className="mb-2 flex items-center gap-2 font-medium">
              <Send className="size-4 text-muted" />
              {t("What we sent")}
            </h2>
            <Timeline conversations={conversations} name={name} agentName={agentName} />
            <p className="mt-3 text-[12px] text-faint">
              {agentName
                ? t("Only what went out automatically, and what {name} did with their link. Their replies go to the mailbox of {agent} and are answered there.", { name: firstName, agent: agentName.split(" ")[0]! })
                : t("Only what went out automatically, and what {name} did with their link. Their replies go to the agent's own mailbox and are answered there.", { name: firstName })}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function NextStep({ t, item, firstName }: { t: T; item: RequestItem; firstName: string }) {
  const viewing = item.viewing;
  // The rare request a person must act on: what to do comes first, whatever its stage.
  if (needsPerson(item))
    return (
      <div>
        <p className="font-medium text-danger">{t(requestReasonLabel[item.reason!]!)}</p>
        <p className="mt-0.5 text-muted">{needsYouText[item.reason!]?.(t, firstName)}</p>
      </div>
    );
  switch (item.stage) {
    case "contacted":
      return (
        <div>
          <p className="font-medium">{item.invitedAt ? t("Booking link sent {when}", { when: t.relative(item.invitedAt) }) : t("Contacted by phone")}</p>
          <p className="mt-0.5 text-muted">
            {item.invitedAt
              ? t("{name} can pick a time with the link. If they haven't booked, they get a reminder with free times after 24 hours, and another after 72 hours.", { name: firstName })
              : t("If they call back or book through the website, it shows up here.")}
          </p>
        </div>
      );
    case "not_planned":
      return (
        <div>
          <p className="font-medium">{item.remindedAt ? t("Reminder {n} of 2 sent {when}", { n: item.reminders, when: t.relative(item.remindedAt) }) : t("No booking yet")}</p>
          <p className="mt-0.5 text-muted">
            {!item.remindedAt
              ? t("{name} got the booking link {when} and hasn't booked. The first reminder goes out with the next automatic run (once a day, late afternoon), the second 72 hours after the link.", { name: firstName, when: item.invitedAt ? t.relative(item.invitedAt) : "" })
              : item.reminders < 2
                ? t("No booking since. A second reminder goes out 72 hours after the link. A call can still help.")
                : t("No booking since. Without one, the request closes 3 days after this last reminder. A call can still help.")}
          </p>
        </div>
      );
    case "planned":
      return (
        <div>
          <p className="font-medium">{viewing ? t("Viewing {when}", { when: t.dateTime(viewing.startsAt) }) : t("Viewing booked")}</p>
          <p className="mt-0.5 text-muted">
            {viewing?.agentName ? `${t("With {name}.", { name: viewing.agentName })} ` : ""}
            {t("{name} got the confirmation and gets a reminder the day before.", { name: firstName })}{" "}
            <Link href="/calendar" className="underline-offset-2 hover:underline">{t("See the calendar")}</Link>
          </p>
        </div>
      );
    case "visited":
      return (
        <div>
          <p className="font-medium">{viewing ? t("Visited {when}", { when: t.dateTime(viewing.startsAt) }) : t("Visited")}</p>
          <p className="mt-0.5 text-muted">{t("The follow-up after the viewing goes out on its own the next day.")}</p>
        </div>
      );
    case "closed":
      return (
        <div>
          <p className="font-medium">{t(requestReasonLabel[item.reason ?? "no_response"]!)}</p>
          <p className="mt-0.5 text-muted">
            {item.reason === "no_response" ? t("{name} didn't book after the link and two reminders. We stopped writing.", { name: firstName }) : t("Closed. Nothing more goes out.")}
          </p>
        </div>
      );
  }
}
