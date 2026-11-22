import { notFound } from "next/navigation";
import { adminConsentUrl, runTool, tools } from "@viewing/core";
import { headers } from "next/headers";
import { CalendarPlus, KeyRound } from "lucide-react";
import { Avatar, PageHeader, Panel, StatusDot } from "@/components/ui";
import { getSession, getToolContext } from "@/lib/context";
import { formatDay, formatRelative, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { disconnectCalendarAction, saveAgentAction, saveAvailabilityAction } from "../../actions";
import { AgentEmail } from "../agent-forms";
import { AvailabilityForm } from "./availability-form";
import { InviteButton } from "./login-panel";
import { cancelInvitationAction, inviteAgentAction, removeLoginAction, setLoginRoleAction } from "../team-actions";
import { CopyText } from "../../settings/channels";

const connectNotice: Record<string, string> = {
  ok: "Connected.",
  denied: "Access was not granted.",
  failed: "Connecting failed. Try again, and allow calendar access.",
};

/** The admin approval link for organisations that don't let staff approve apps themselves. */
async function adminLink() {
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return adminConsentUrl({ redirectUri: new URL("/api/calendar/microsoft/callback", origin).toString() });
}

const roleLabel = { owner: "Owner", admin: "Admin", member: "Agent" } as const;

/** Whether the agent can log in, and for admins the invite, role and remove buttons. */
async function LoginPanel({ agentId, email }: { agentId: string; email: string | null }) {
  const { user, isAdmin } = await getSession();
  const { login, link } = await runTool(tools.getAgentLogin, await getToolContext(), { agentId });
  const self = login.status === "member" && login.userId === user.id;
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 font-medium">
        <KeyRound className="size-4 text-muted" />
        Login
      </div>
      {login.status === "member" && (
        <>
          <p className="mt-1 flex items-center gap-1.5">
            <StatusDot color="var(--success)" />
            Can log in · {roleLabel[login.role]}
            {self && <span className="text-muted">(you)</span>}
          </p>
          <p className="mt-1 text-[12px] text-muted">
            {login.role === "member" ? "Sees the whole agency and runs their own viewings. Can't change settings or invite colleagues." : "Can change settings and invite colleagues."}
          </p>
          {isAdmin && !self && login.role !== "owner" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={setLoginRoleAction.bind(null, agentId, login.memberId, login.role === "admin" ? "member" : "admin")}>
                <button className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-[12px] font-medium hover:bg-hover">{login.role === "admin" ? "Make agent" : "Make admin"}</button>
              </form>
              <form action={removeLoginAction.bind(null, agentId, login.memberId)}>
                <button className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] text-muted hover:bg-hover hover:text-danger">Remove login</button>
              </form>
            </div>
          )}
        </>
      )}
      {login.status === "invited" && (
        <>
          <p className="mt-1 flex items-center gap-1.5">
            <StatusDot color={login.expired ? "var(--danger)" : "var(--warning)"} />
            {login.expired ? "Invitation expired" : `Invited ${formatRelative(login.invitedAt)}`}
          </p>
          {isAdmin && (
            <>
              {!login.expired && link && (
                <div className="mt-2">
                  <p className="mb-1 text-[12px] text-muted">The invitation went to {email}. You can also send this link yourself:</p>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{link}</span>
                    <CopyText text={link} />
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <InviteButton action={inviteAgentAction.bind(null, agentId)} again />
                {!login.expired && (
                  <form action={cancelInvitationAction.bind(null, agentId, login.invitationId)}>
                    <button className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] text-muted hover:bg-hover hover:text-fg">Cancel invitation</button>
                  </form>
                )}
              </div>
            </>
          )}
        </>
      )}
      {login.status === "none" && (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-muted">
            <StatusDot color="var(--line-strong)" />
            No login yet
          </p>
          {isAdmin && (
            <>
              <p className="mt-1 text-[12px] text-muted">
                {email ? `We email ${email} a link to set a password. They then connect their own Outlook or Gmail.` : "Add the agent's email address above to invite them."}
              </p>
              <div className="mt-3">
                <InviteButton action={inviteAgentAction.bind(null, agentId)} disabled={!email} />
              </div>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

export default async function AgentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ connect?: string; welcome?: string }> }) {
  const { id } = await params;
  const { connect, welcome } = await searchParams;
  const ctx = await getToolContext();
  const availability = await runTool(tools.getAgentAvailability, ctx, { agentId: id }).catch(() => null);
  if (!availability) notFound();
  const { agent, workingHours } = availability;
  const [{ slots }, { connections, available }] = await Promise.all([
    runTool(tools.availableSlots, ctx, { agentId: id, days: 7 }),
    runTool(tools.listConnections, ctx, { agentId: id }),
  ]);

  return (
    <>
      <PageHeader crumbs={[{ label: "Agents", href: "/agents" }, { label: agent.name }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1000px] gap-6 px-5 py-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <div className="mb-6 flex items-center gap-3">
              <Avatar name={agent.name} color={agent.color} size={36} />
              <div>
                <h1 className="text-[18px] font-semibold tracking-tight">{agent.name}</h1>
                <div className="text-muted">
                  <AgentEmail agentId={agent.id} email={agent.email} action={saveAgentAction} />
                </div>
              </div>
            </div>
            {welcome && !connections.some((c) => c.scopes.includes("mail") && c.status === "active") && (available.google || available.microsoft) && (
              <Panel className="mb-6 p-4">
                <div className="font-medium">Welcome, {agent.name.split(" ")[0]}</div>
                <p className="mt-1 text-muted">One step left: connect your mailbox. Messages to your clients then go out from your own address, and your busy times block bookings. With Outlook, portal leads also reach the planner on their own.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["microsoft", "google"] as const)
                    .filter((p) => available[p])
                    .map((p) => (
                      <a key={p} href={`/api/calendar/${p}/start?agentId=${agent.id}`} className="inline-flex h-8 items-center rounded-md bg-primary px-3 font-medium text-primary-fg hover:opacity-90">
                        Connect {p === "google" ? "Gmail" : "Outlook"}
                      </a>
                    ))}
                </div>
              </Panel>
            )}
            <h2 className="mb-1 font-medium">Working hours for viewings</h2>
            <p className="mb-3 text-muted">Clients can only book inside these hours, never over existing appointments or calendar events.</p>
            <AvailabilityForm
              workingHours={workingHours}
              slotMinutes={agent.slotMinutes}
              bufferMinutes={agent.bufferMinutes}
              action={saveAvailabilityAction.bind(null, agent.id)}
            />
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <Panel className="p-4">
              <div className="flex items-center gap-2 font-medium">
                <CalendarPlus className="size-4 text-muted" />
                Calendar and mailbox
              </div>
              {connect === "admin" && (
                <div className="mt-2 rounded-md border border-line p-2.5 text-[12px]">
                  <p className="font-medium text-danger">Your company needs an admin to approve the planner first.</p>
                  <p className="mt-1 text-muted">Send this link to your Microsoft 365 administrator. They approve once for everyone, then click Connect Outlook again.</p>
                  <div className="mt-2">
                    <CopyText text={await adminLink()} />
                  </div>
                </div>
              )}
              {connectNotice[connect ?? ""] && <p className={cn("mt-2 text-[12px]", connect === "ok" ? "text-success" : "text-danger")}>{connectNotice[connect!]}</p>}
              {connections.length === 0 && (
                <p className="mt-1 flex items-center gap-1.5 text-muted">
                  <StatusDot color="var(--line-strong)" />
                  Not connected
                </p>
              )}
              <ul className="mt-2 flex flex-col gap-2">
                {connections.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    <StatusDot color={c.status === "active" ? "var(--success)" : "var(--warning)"} className="mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{c.accountEmail}</div>
                      <div className="text-[12px] text-muted">
                        {c.provider === "google" ? "Google" : "Outlook"} · {c.status === "active" ? [c.scopes.includes("calendar") && "calendar", c.scopes.includes("mail") && "sends email", c.scopes.includes("leads") && "reads lead emails"].filter(Boolean).join(", ") : "expired, connect again"}
                      </div>
                    </div>
                    <form action={disconnectCalendarAction.bind(null, agent.id, c.id)}>
                      <button className="text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline">Disconnect</button>
                    </form>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["microsoft", "google"] as const)
                  .filter((p) => !connections.some((c) => c.provider === p && c.status === "active"))
                  .map((p) =>
                    available[p] ? (
                      <a key={p} href={`/api/calendar/${p}/start?agentId=${agent.id}`} className="inline-flex h-8 items-center rounded-md border border-line px-3 hover:bg-hover">
                        Connect {p === "google" ? "Google" : "Outlook"}
                      </a>
                    ) : null,
                  )}
              </div>
              <p className="mt-2 text-[12px] text-faint">
                {available.google || available.microsoft
                  ? "Busy times block bookings, viewings are added to the agenda, and messages to clients go out from this mailbox. With Outlook we also pick up lead emails from Immoweb, Zimmo, Immovlan, Immoscoop and your website as they arrive. We never open any other email."
                  : "Connecting needs the Google and Microsoft app registrations (docs/setup-calendars.md)."}
              </p>
            </Panel>
            <LoginPanel agentId={agent.id} email={agent.email} />
            <Panel className="p-4">
              <div className="font-medium">Next free times</div>
              <ul className="mt-2 flex flex-col gap-1 text-muted tabular-nums">
                {slots.length === 0 && <li>No free times in the next 7 days.</li>}
                {slots.slice(0, 8).map((s) => (
                  <li key={s.start.toISOString()}>
                    {formatDay(s.start)} · {formatTime(s.start)}
                  </li>
                ))}
              </ul>
            </Panel>
          </aside>
        </div>
      </div>
    </>
  );
}
