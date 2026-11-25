import { notFound } from "next/navigation";
import { runTool, tools } from "@viewing/core";
import { platformAgencyId } from "@viewing/core/public";
import { UserPlus } from "lucide-react";
import { EmptyState, PageHeader, Panel, StatusDot } from "@/components/ui";
import { getSession, getToolContext } from "@/lib/context";
import { formatDateTime, formatRelative } from "@/lib/format";
import { approveSignupAction, declineSignupAction } from "./actions";
import { Decision } from "./decision";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n";

const statusLabel = {
  pending: { label: msg("Waiting for you"), color: "var(--warning)" },
  approved: { label: msg("Link sent"), color: "var(--fg)" },
  declined: { label: msg("Declined"), color: "var(--line-strong)" },
  completed: { label: msg("Workspace created"), color: "var(--success)" },
} as const;

/** Workspace requests from agencies (internal, no menu entry): approve or decline each one. */
export default async function SignupsPage() {
  const t = await getT();
  const { agency, isAdmin } = await getSession();
  if (!isAdmin || agency.id !== platformAgencyId()) notFound();
  const requests = await runTool(tools.listSignups, await getToolContext(), {});
  const now = new Date();
  const host = (site: string) => new URL(site).hostname.replace(/^www\./, "");

  const status = (r: (typeof requests)[number]) => {
    if (r.linkExpired) return { label: msg("Link expired"), color: "var(--line-strong)" };
    return statusLabel[r.status];
  };
  const actions = (r: (typeof requests)[number]) =>
    r.status === "completed" ? null : (
      <Decision
        approve={approveSignupAction.bind(null, r.id)}
        decline={r.status === "declined" ? null : declineSignupAction.bind(null, r.id)}
        approveLabel={r.status === "pending" ? t("Approve") : r.status === "declined" ? t("Approve after all") : t("Send a new link")}
      />
    );

  return (
    <>
      <PageHeader crumbs={[{ label: t("Workspace requests") }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-5 py-6">
          <h1 className="text-[18px] font-semibold tracking-tight">{t("Agencies asking for a workspace")}</h1>
          <p className="mt-1 max-w-2xl text-muted">
            {t("Agencies ask on the sign-up page. Approving emails them a link, valid 7 days, to set a password and create their workspace. Declining sends nothing.")}
          </p>

          {requests.length === 0 ? (
            <div className="mt-6">
              <EmptyState icon={<UserPlus className="size-4" />} title={t("No requests yet")} description={t("Requests from the sign-up page show up here, and you get an email for each one.")} />
            </div>
          ) : (
            <>
              <ul className="mt-6 flex flex-col gap-2 md:hidden">
                {requests.map((r) => (
                  <li key={r.id}>
                    <Panel className="p-3">
                      <div className="flex items-center gap-2">
                        <StatusDot color={status(r).color} />
                        <span className="min-w-0 flex-1 truncate font-medium">{r.agencyName}</span>
                        <span className="text-[12px] text-muted">{t.relative(r.createdAt, now)}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-muted">
                        {r.name} · {r.email}
                        {r.phone ? ` · ${r.phone}` : ""}
                        {r.website ? ` · ${host(r.website)}` : ""}
                      </p>
                      {r.note && <p className="mt-1 text-[12px]">{r.note}</p>}
                      <p className="mt-1 text-[12px] text-muted">{t(status(r).label)}</p>
                      <div className="mt-2">{actions(r)}</div>
                    </Panel>
                  </li>
                ))}
              </ul>

              <Panel className="mt-6 hidden overflow-hidden md:block">
                <table className="hidden w-full md:table">
                  <thead className="border-b border-line text-left text-[12px] text-muted">
                    <tr>
                      <th className="px-3 py-2 font-normal">{t("Agency")}</th>
                      <th className="px-3 py-2 font-normal">{t("Contact")}</th>
                      <th className="px-3 py-2 font-normal">{t("Asked")}</th>
                      <th className="px-3 py-2 font-normal">{t("Status")}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} className="border-b border-line align-top last:border-0">
                        <td className="px-3 py-2.5">
                          <p className="font-medium">{r.agencyName}</p>
                          {r.website && (
                            <a href={r.website} target="_blank" rel="noreferrer" className="text-[12px] text-muted underline-offset-2 hover:underline">
                              {host(r.website)}
                            </a>
                          )}
                          {r.note && <p className="mt-1 max-w-[260px] text-[12px] text-muted">{r.note}</p>}
                        </td>
                        <td className="px-3 py-2.5">
                          <p>{r.name}</p>
                          <p className="text-[12px] text-muted">
                            {r.email}
                            {r.phone ? ` · ${r.phone}` : ""}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-muted">{t.dateTime(r.createdAt)}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <StatusDot color={status(r).color} />
                            {t(status(r).label)}
                          </span>
                          {r.status === "approved" && r.tokenExpiresAt && !r.linkExpired && (
                            <p className="pl-[14px] text-[12px] text-muted">{t("until {when}", { when: t.dateTime(r.tokenExpiresAt) })}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">{actions(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </>
          )}
        </div>
      </div>
    </>
  );
}
