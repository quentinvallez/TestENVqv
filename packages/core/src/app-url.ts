/** Public address of the app (APP_URL, else this Vercel deployment, else localhost), so links in messages work outside it. */
export function appOrigin(): string {
  const host =
    process.env.APP_URL ??
    (process.env.VERCEL_BRANCH_URL
      ? `https://${process.env.VERCEL_BRANCH_URL}`
      : process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000");
  return new URL(host).origin;
}

/**
 * Where short links in client messages live: SHORT_LINK_URL (the brand domain, e.g. https://unbird.io,
 * once it points at this app), else the app's own address.
 */
export function shortLinkOrigin(): string {
  const configured = process.env.SHORT_LINK_URL?.trim();
  return configured ? new URL(configured).origin : appOrigin();
}
