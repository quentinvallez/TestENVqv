import { redirect } from "next/navigation";

/** The inbox became the viewing requests board; old links (e.g. in emails) land on the request. */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  redirect(c ? `/requests/${c}` : "/requests");
}
