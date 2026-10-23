import { runTool, tools } from "@viewing/core";
import { MessageCircle, UserRound } from "lucide-react";
import { EmptyState, PageHeader, Pill } from "@/components/ui";
import { getToolContext } from "@/lib/context";
import { formatRelative, fullName } from "@/lib/format";

export default async function ContactsPage() {
  const contacts = await runTool(tools.listContacts, await getToolContext(), {});
  return (
    <>
      <PageHeader crumbs={[{ label: "Contacts" }]} />
      <div className="flex-1 overflow-auto">
        {contacts.length === 0 ? (
          <EmptyState icon={<UserRound className="size-5" />} title="No contacts yet" description="Everyone who sends a request or books a viewing is added here automatically." />
        ) : (
          <table className="w-full min-w-[760px] text-left">
            <thead className="sticky top-0 bg-panel text-[12px] text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 pl-5 font-normal">Name</th>
                <th className="px-3 font-normal">Email</th>
                <th className="px-3 font-normal">Phone</th>
                <th className="px-3 font-normal">Language</th>
                <th className="px-3 font-normal">Open leads</th>
                <th className="py-2 pr-5 pl-3 font-normal">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="py-2.5 pr-3 pl-5 font-medium">{fullName(c.firstName, c.lastName)}</td>
                  <td className="px-3 text-muted">{c.email}</td>
                  <td className="px-3 whitespace-nowrap text-muted">
                    <span className="flex items-center gap-1.5">
                      {c.phone}
                      {c.whatsappOptIn && <MessageCircle className="size-3.5 text-success" aria-label="WhatsApp opt-in" />}
                    </span>
                  </td>
                  <td className="px-3">{c.language && <Pill>{c.language.toUpperCase()}</Pill>}</td>
                  <td className="px-3 tabular-nums">{c.openLeads}</td>
                  <td className="py-2.5 pr-5 pl-3 text-muted">{formatRelative(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
