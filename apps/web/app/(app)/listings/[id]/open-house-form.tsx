"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import type { OpenHouseState } from "../../actions";
import { useT } from "@/lib/i18n/client";

const field = "h-8 w-full rounded-md border border-line bg-panel px-2 outline-none focus:border-line-strong";

/** Plans an open house: date, from–to, time slots and how many visitors per slot. */
export function OpenHouseForm({
  action,
  agents,
  defaultAgentId,
}: {
  action: (state: OpenHouseState, form: FormData) => Promise<OpenHouseState>;
  agents: { id: string; name: string }[];
  defaultAgentId: string | null;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, undefined);
  const [slotMinutes, setSlotMinutes] = useState("15");
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">{t("Date")}</span>
          <input type="date" name="date" required className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">{t("From")}</span>
          <input type="time" name="start" required step={300} defaultValue="10:00" className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">{t("To")}</span>
          <input type="time" name="end" required step={300} defaultValue="12:00" className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">{t("Time slots")}</span>
          <select name="slotMinutes" value={slotMinutes} onChange={(e) => setSlotMinutes(e.target.value)} className={field}>
            <option value="10">{t("Every 10 minutes")}</option>
            <option value="15">{t("Every 15 minutes")}</option>
            <option value="20">{t("Every 20 minutes")}</option>
            <option value="30">{t("Every 30 minutes")}</option>
            <option value="60">{t("Every hour")}</option>
            <option value="0">{t("No time slots, come any time")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">{slotMinutes === "0" ? t("Visitors in all") : t("Visitors per slot")}</span>
          <input type="number" name="perSlot" min={1} max={100} defaultValue={slotMinutes === "0" ? 20 : 4} key={slotMinutes === "0" ? "all" : "per"} required className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">{t("Agent")}</span>
          <select name="agentId" defaultValue={defaultAgentId ?? ""} className={field}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input name="note" placeholder={t("Note for the agent (optional)")} className={field} />
      <label className="flex items-start gap-2">
        <input type="checkbox" name="exclusive" defaultChecked className="mt-0.5" />
        <span>
          {t("Only offer the open house until it's over")}
          <span className="block text-[12px] text-muted">{t("The website, booking link and offered times show only its slots. Untick to offer it next to the usual times.")}</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={pending}>
          {pending ? t("Planning…") : t("Plan the open house")}
        </Button>
        {state?.planned && <span className="text-success">{t("Planned. Visitors can book it now.")}</span>}
        {state?.error && <span className="text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
