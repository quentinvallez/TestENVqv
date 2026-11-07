"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui";
import type { AssignState } from "../../actions";

/**
 * Pick the agent responsible for a listing; saves as soon as it changes.
 * Calls the action directly instead of through `<form action>`: React resets a
 * form after its action finishes, which put the select and the avatar out of step.
 */
export function AgentPicker({
  agents,
  currentId,
  action,
}: {
  agents: { id: string; name: string; color: string | null; office: string | null }[];
  currentId: string | null;
  action: (state: AssignState, form: FormData) => Promise<AssignState>;
}) {
  const [state, setState] = useState<AssignState>(undefined);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(currentId ?? "");
  // Follow the saved value when the page data changes (another tab, a revert on error).
  const [lastCurrent, setLastCurrent] = useState(currentId);
  if (currentId !== lastCurrent) {
    setLastCurrent(currentId);
    setSelected(currentId ?? "");
  }
  const agent = agents.find((a) => a.id === selected);

  function change(agentId: string) {
    const previous = selected;
    setSelected(agentId);
    const form = new FormData();
    form.set("agentId", agentId);
    startTransition(async () => {
      const result = await action(undefined, form);
      if (result?.error) setSelected(previous);
      setState(result);
    });
  }

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2">
        {agent && <Avatar name={agent.name} color={agent.color} size={24} />}
        <select
          name="agentId"
          value={selected}
          onChange={(e) => change(e.target.value)}
          disabled={pending}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 font-medium outline-none focus:border-line-strong"
          aria-label="Responsible agent"
        >
          {!selected && <option value="">Unassigned</option>}
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
    </div>
  );
}
