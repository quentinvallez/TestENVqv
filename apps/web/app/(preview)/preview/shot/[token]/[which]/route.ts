import { previewByToken } from "@viewing/core/public";

export const dynamic = "force-dynamic";

/** The picture of the agency's page that a preview shows when the site can't be shown in a frame. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; which: string }> }) {
  const { token, which } = await params;
  const preview = await previewByToken(token);
  const shots: Record<string, string | null | undefined> = {
    home: preview?.homeShot,
    listing: preview?.listingShot,
    "home-phone": preview?.homeShotPhone ?? preview?.homeShot,
    "listing-phone": preview?.listingShotPhone ?? preview?.listingShot,
  };
  const shot = shots[which];
  if (!shot) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(shot, "base64"), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex" },
  });
}
