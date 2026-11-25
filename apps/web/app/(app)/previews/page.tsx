import Link from "next/link";
import { runTool, tools } from "@viewing/core";
import { ExternalLink, ScanEye, Trash2 } from "lucide-react";
import { CopyLinkButton } from "@/components/copy-link";
import { Button, EmptyState, PageHeader, Panel, StatusDot } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { formatDateTime, formatRelative } from "@/lib/format";
import { createPreviewAction, deletePreviewAction } from "../actions";
import { PreviewForm } from "./preview-form";
import { getT } from "@/lib/i18n/server";

// Reading a site for a preview takes up to about 15 seconds.
export const maxDuration = 30;

export default async function PreviewsPage() {
  const t = await getT();
  const ctx = await getToolContext();
  const previews = await runTool(tools.listWidgetPreviews, ctx, {});
  const now = new Date();
  const host = (site: string) => new URL(site).hostname.replace(/^www\./, "");

  return (
    <>
      <PageHeader crumbs={[{ label: t("Widget previews") }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-5 py-6">
          <h1 className="text-[18px] font-semibold tracking-tight">{t("Show an agency the planner on its own website")}</h1>
          <p className="mt-1 max-w-2xl text-muted">
            {t("Enter a prospect's website. We read its colour and a few of its listings, and make a link that shows our booking widget on those listings, on a page of ours. Nothing is put on their site and booking in the preview books nothing. Links work for 30 days.")}
          </p>
          <Panel className="mt-5 p-4">
            <PreviewForm action={createPreviewAction} />
          </Panel>

          {previews.length === 0 ? (
            <div className="mt-6">
              <EmptyState icon={<ScanEye className="size-4" />} title={t("No previews yet")} description={t("Make one for an agency you're talking to, then send them the link.")} />
            </div>
          ) : (
            <>
              <ul className="mt-6 flex flex-col gap-2 md:hidden">
                {previews.map((p) => (
                  <li key={p.id}>
                    <Panel className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 flex-none rounded-full border border-line" style={{ background: p.brandColor ?? "var(--line-strong)" }} />
                        <span className="min-w-0 flex-1 truncate font-medium">{p.name ?? host(p.site)}</span>
                        <span className="text-[12px] text-muted">{t("{n}× opened", { n: p.views })}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-muted">
                        {host(p.site)} · {t("{n} listings", { n: p.listingCount })} · {p.source === "public" ? `${t("form")}${p.email ? `, ${p.email}` : ""}` : t("made here")}
                        {p.demoBookings ? ` · ${t("tried booking {n}×", { n: p.demoBookings })}` : ""}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Link href={`/preview/${p.token}?own=1`} target="_blank">
                          <Button size="sm">
                            <ExternalLink className="size-3.5" />
                            {t("Open")}
                          </Button>
                        </Link>
                        <CopyLinkButton path={`/preview/${p.token}`} label={t("Copy link")} />
                        <form action={deletePreviewAction.bind(null, p.id)} className="ml-auto">
                          <Button size="sm" variant="ghost" aria-label={t("Delete")}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </form>
                      </div>
                    </Panel>
                  </li>
                ))}
              </ul>

              <Panel className="mt-6 hidden overflow-hidden md:block">
                <table className="hidden w-full md:table">
                  <thead className="border-b border-line text-left text-[12px] text-muted">
                    <tr>
                      <th className="px-3 py-2 font-normal">{t("Agency")}</th>
                      <th className="px-3 py-2 font-normal">{t("From")}</th>
                      <th className="px-3 py-2 font-normal">{t("Shown as")}</th>
                      <th className="px-3 py-2 font-normal">{t("Opened")}</th>
                      <th className="px-3 py-2 font-normal">{t("Expires")}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {previews.map((p) => {
                      const expired = p.expiresAt < now;
                      return (
                        <tr key={p.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="size-2.5 flex-none rounded-full border border-line" style={{ background: p.brandColor ?? "var(--line-strong)" }} />
                              <span className="font-medium">{p.name ?? host(p.site)}</span>
                            </div>
                            <p className="pl-[18px] text-[12px] text-muted">
                              {host(p.site)} · {t("{n} listings", { n: p.listingCount })}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-muted">{p.source === "public" ? (p.email ?? t("Preview form")) : t("Made here")}</td>
                          <td className="px-3 py-2.5 text-muted">
                            {p.framed ? t("The live site") : p.pictures ? t("Picture of the site") : t("Rebuilt page")}
                          </td>
                          <td className="px-3 py-2.5">
                            {p.views ? t("{n}×, last {when}", { n: p.views, when: t.relative(p.lastViewedAt ?? p.createdAt, now) }) : <span className="text-muted">{t("Not yet")}</span>}
                            {p.demoBookings > 0 && <p className="text-[12px] text-muted">{t("Tried booking {n}×", { n: p.demoBookings })}</p>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-muted">
                              <StatusDot color={expired ? "var(--line-strong)" : "var(--success)"} />
                              {expired ? t("Expired") : t.dateTime(p.expiresAt)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <Link href={`/preview/${p.token}?own=1`} target="_blank">
                                <Button size="sm">
                                  <ExternalLink className="size-3.5" />
                                  {t("Open")}
                                </Button>
                              </Link>
                              <CopyLinkButton path={`/preview/${p.token}`} label={t("Copy link")} />
                              <form action={deletePreviewAction.bind(null, p.id)}>
                                <Button size="sm" variant="ghost" aria-label={t("Delete")}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
