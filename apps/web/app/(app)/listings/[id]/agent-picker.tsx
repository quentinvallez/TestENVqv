"use client";

import { useActionState, useState } from "react";
import { Avatar } from "@/components/ui";
import type { AssignState } from "../../actions";

/** Pick the agent responsible for a listing; saves as soon as it changes. */
export function AgentPicker({
  agents,
  currentId,
  action,
}: {
  agents: { id: string; name: string; color: string | null; office: string | null }[];
  currentId: string | null;
  action: (state: AssignState, form: FormData) => Promise<AssignState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [selected, setSelected] = useState(currentId ?? "");
  const agent = agents.find((a) => a.id === selected);

  return (
    <form action={formAction} className="mt-1.5">
      <div className="flex items-center gap-2">
        {agent && <Avatar name={agent.name} color={agent.color} size={24} />}
        <select
          name="agentId"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            e.currentTarget.form?.requestSubmit();
          }}
          disabled={pending}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 font-medium outline-none focus:border-line-strong"
          aria-label="Responsible agent"
        >
          {!currentId && <option value="">Unassigned</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.office ? ` · ${a.office}` : ""}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 h-4 text-[11px]">
        {pending ? <span className="text-muted">Saving…</span> : state?.error ? <span className="text-danger">{state.error}</span> : state?.saved ? <span className="text-success">{state.saved}</span> : <span className="text-faint">Planned viewings stay with their agent.</span>}
      </p>
    </form>
  );
}
