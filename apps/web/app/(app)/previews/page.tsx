import Link from "next/link";
import { runTool, tools } from "@viewing/core";
import { ExternalLink, ScanEye, Trash2 } from "lucide-react";
import { CopyLinkButton } from "@/components/copy-link";
import { Button, EmptyState, PageHeader, Panel, StatusDot } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { formatDateTime, formatRelative } from "@/lib/format";
import { createPreviewAction, deletePreviewAction } from "../actions";
import { PreviewForm } from "./preview-form";

// Reading a site and taking pictures of it can take most of a minute.
export const maxDuration = 90;

export default async function PreviewsPage() {
  const ctx = await getToolContext();
  const previews = await runTool(tools.listWidgetPreviews, ctx, {});
  const now = new Date();
  const host = (site: string) => new URL(site).hostname.replace(/^www\./, "");

  return (
    <>
      <PageHeader crumbs={[{ label: "Widget previews" }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-5 py-6">
          <h1 className="text-[18px] font-semibold tracking-tight">Show an agency the planner on its own website</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Enter a prospect&apos;s website. We read its colour and a few of its listings, and make a link that shows our booking widget on those
            listings, on a page of ours. Nothing is put on their site and booking in the preview books nothing. Links work for 30 days.
          </p>
          <Panel className="mt-5 p-4">
            <PreviewForm action={createPreviewAction} />
          </Panel>

          {previews.length === 0 ? (
            <div className="mt-6">
              <EmptyState icon={<ScanEye className="size-4" />} title="No previews yet" description="Make one for an agency you're talking to, then send them the link." />
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
                        <span className="text-[12px] text-muted">{p.views}× opened</span>
                      </div>
                      <p className="mt-1 text-[12px] text-muted">
                        {host(p.site)} · {p.listingCount} listings · {p.source === "public" ? `form${p.email ? `, ${p.email}` : ""}` : "made here"}
                        {p.demoBookings ? ` · tried booking ${p.demoBookings}×` : ""}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Link href={`/preview/${p.token}?own=1`} target="_blank">
                          <Button size="sm">
                            <ExternalLink className="size-3.5" />
                            Open
                          </Button>
                        </Link>
                        <CopyLinkButton path={`/preview/${p.token}`} label="Copy link" />
                        <form action={deletePreviewAction.bind(null, p.id)} className="ml-auto">
                          <Button size="sm" variant="ghost" aria-label="Delete">
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
                      <th className="px-3 py-2 font-normal">Agency</th>
                      <th className="px-3 py-2 font-normal">From</th>
                      <th className="px-3 py-2 font-normal">Shown as</th>
                      <th className="px-3 py-2 font-normal">Opened</th>
                      <th className="px-3 py-2 font-normal">Expires</th>
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
                              {host(p.site)} · {p.listingCount} listings
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-muted">{p.source === "public" ? (p.email ?? "Preview form") : "Made here"}</td>
                          <td className="px-3 py-2.5 text-muted">{p.pictures ? "Picture of the site" : "The live site"}</td>
                          <td className="px-3 py-2.5">
                            {p.views ? `${p.views}×, last ${formatRelative(p.lastViewedAt ?? p.createdAt, now)}` : <span className="text-muted">Not yet</span>}
                            {p.demoBookings > 0 && <p className="text-[12px] text-muted">Tried booking {p.demoBookings}×</p>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-muted">
                              <StatusDot color={expired ? "var(--line-strong)" : "var(--success)"} />
                              {expired ? "Expired" : formatDateTime(p.expiresAt)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <Link href={`/preview/${p.token}?own=1`} target="_blank">
                                <Button size="sm">
                                  <ExternalLink className="size-3.5" />
                                  Open
                                </Button>
                              </Link>
                              <CopyLinkButton path={`/preview/${p.token}`} label="Copy link" />
                              <form action={deletePreviewAction.bind(null, p.id)}>
                                <Button size="sm" variant="ghost" aria-label="Delete">
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
