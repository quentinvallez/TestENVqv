"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Building2, Clock, Mail, Phone } from "lucide-react";
import { Avatar, Pill, StatusDot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelative, fullName } from "@/lib/format";
import { leadStageMeta, sourceLabel } from "@/lib/labels";
import { moveLeadStageAction } from "../actions";

type Stage = keyof typeof leadStageMeta;
export type BoardLead = {
  id: string;
  stage: Stage;
  source: string;
  createdAt: Date;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  listingId: string | null;
  listingReference: string | null;
  listingStreet: string | null;
  listingHouseNumber: string | null;
  agentName: string | null;
  agentColor: string | null;
};

const columns: Stage[] = ["new", "invited", "booked", "visited", "follow_up", "offer"];

export function LeadBoard({ leads }: { leads: BoardLead[] }) {
  const [, startTransition] = useTransition();
  const [optimistic, move] = useOptimistic(leads, (state, { id, stage }: { id: string; stage: Stage }) =>
    state.map((lead) => (lead.id === id ? { ...lead, stage } : lead)),
  );

  const [mobileStage, setMobileStage] = useState<Stage>("new");
  const moveTo = (id: string, stage: Stage) =>
    startTransition(async () => {
      move({ id, stage });
      await moveLeadStageAction(id, stage);
    });

  const onDrop = (stage: Stage, e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/lead-id");
    const lead = optimistic.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    startTransition(async () => {
      move({ id, stage });
      await moveLeadStageAction(id, stage);
    });
  };

  return (
    <>
    {/* Phones: one stage at a time; touch screens can't drag between columns. */}
    <div className="flex h-full flex-col md:hidden">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-2">
        {columns.map((stage) => (
          <button
            key={stage}
            onClick={() => setMobileStage(stage)}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5", mobileStage === stage ? "bg-primary text-primary-fg" : "text-muted")}
          >
            <StatusDot color={leadStageMeta[stage].color} />
            {leadStageMeta[stage].label}
            <span className="tabular-nums opacity-70">{optimistic.filter((l) => l.stage === stage).length}</span>
          </button>
        ))}
      </div>
      <ul className="flex-1 divide-y divide-line overflow-y-auto">
        {optimistic.filter((l) => l.stage === mobileStage).length === 0 && <li className="px-4 py-10 text-center text-muted">No leads in this stage.</li>}
        {optimistic
          .filter((l) => l.stage === mobileStage)
          .map((lead) => (
            <li key={lead.id} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate font-medium">{fullName(lead.firstName, lead.lastName)}</span>
                <Pill>{sourceLabel[lead.source] ?? lead.source}</Pill>
              </div>
              {lead.listingId && (
                <div className="mt-0.5 truncate text-[12px] text-muted">
                  {lead.listingReference} · {[lead.listingStreet, lead.listingHouseNumber].filter(Boolean).join(" ")}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                {lead.phone && (
                  <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3">
                    <Phone className="size-3.5" />
                    Call
                  </a>
                )}
                <select
                  value={lead.stage}
                  onChange={(e) => moveTo(lead.id, e.target.value as Stage)}
                  className="h-9 flex-1 rounded-md border border-line bg-panel px-2"
                  aria-label="Move to stage"
                >
                  {columns.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage === lead.stage ? leadStageMeta[stage].label : `Move to ${leadStageMeta[stage].label}`}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-faint">{formatRelative(lead.createdAt)}</span>
              </div>
            </li>
          ))}
      </ul>
    </div>
    <div className="hidden h-full gap-3 overflow-x-auto bg-canvas p-3 md:flex">
      {columns.map((stage) => {
        const items = optimistic.filter((l) => l.stage === stage);
        return (
          <section
            key={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(stage, e)}
            className="flex w-[264px] shrink-0 flex-col rounded-lg"
          >
            <header className="flex h-9 items-center gap-2 px-1.5">
              <StatusDot color={leadStageMeta[stage].color} />
              <span className="font-medium">{leadStageMeta[stage].label}</span>
              <span className="text-faint tabular-nums">{items.length}</span>
            </header>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto pb-2">
              {items.map((lead) => (
                <article
                  key={lead.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/lead-id", lead.id)}
                  className={cn("cursor-grab rounded-lg border border-line bg-panel p-3 transition-shadow hover:border-line-strong active:cursor-grabbing")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate font-medium">{fullName(lead.firstName, lead.lastName)}</span>
                    <Pill className="shrink-0">{sourceLabel[lead.source] ?? lead.source}</Pill>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1 text-[12px] text-muted">
                    {lead.listingId && (
                      <li className="flex items-center gap-1.5 truncate">
                        <Building2 className="size-3.5 shrink-0" />
                        <Link href={`/listings/${lead.listingId}`} className="truncate hover:text-fg" onClick={(e) => e.stopPropagation()}>
                          {lead.listingReference} · {[lead.listingStreet, lead.listingHouseNumber].filter(Boolean).join(" ")}
                        </Link>
                      </li>
                    )}
                    {lead.email && (
                      <li className="flex items-center gap-1.5 truncate">
                        <Mail className="size-3.5 shrink-0" />
                        <span className="truncate">{lead.email}</span>
                      </li>
                    )}
                    {lead.phone && (
                      <li className="flex items-center gap-1.5">
                        <Phone className="size-3.5 shrink-0" />
                        {lead.phone}
                      </li>
                    )}
                  </ul>
                  <footer className="mt-2.5 flex items-center justify-between text-[12px] text-faint">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {formatRelative(lead.createdAt)}
                    </span>
                    {lead.agentName && <Avatar name={lead.agentName} color={lead.agentColor} size={18} />}
                  </footer>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
    </>
  );
}
