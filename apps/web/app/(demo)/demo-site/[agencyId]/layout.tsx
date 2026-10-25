/** Every page of the demo site carries the agency's widget.js, as on a real agency site. */
export default async function DemoSiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ agencyId: string }> }) {
  const { agencyId } = await params;
  return (
    <>
      {children}
      <script src="/widget.js" data-agency={agencyId} data-lang="nl" async />
    </>
  );
}
