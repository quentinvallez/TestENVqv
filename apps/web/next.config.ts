import type { NextConfig } from "next";

// Chromium for reading websites that load their listings while you scroll (packages/core/src/website/browser.ts):
// loaded from node_modules at run time, with its compressed binary, only where the website import runs.
const chromium = ["../../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**"];

const config: NextConfig = {
  transpilePackages: ["@viewing/core", "@viewing/db"],
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: { "/listings/website": chromium, "/api/cron/website": chromium },
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] },
};

export default config;
