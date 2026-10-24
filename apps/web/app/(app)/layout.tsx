import { runTool, tools } from "@viewing/core";
import { CommandMenu } from "@/components/command-menu";
import { MobileTabBar } from "@/components/mobile-nav";
import { Sidebar } from "@/components/sidebar";
import { getSession, getToolContext } from "@/lib/context";
import { address } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, agency } = await getSession();
  const ctx = await getToolContext();
  const [listings, proposals] = await Promise.all([
    runTool(tools.listListings, ctx, {}),
    runTool(tools.listProposals, ctx, {}),
  ]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <Sidebar agencyName={agency.name} userName={user.name} inboxCount={proposals.length} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel md:my-2 md:mr-2 md:rounded-xl md:border md:border-line">
        {children}
      </main>
      <MobileTabBar agencyName={agency.name} userName={user.name} inboxCount={proposals.length} />
      <CommandMenu
        listings={listings.map((l) => ({ id: l.id, label: `${l.reference} · ${address(l.street, l.houseNumber, l.city)}` }))}
      />
    </div>
  );
}
