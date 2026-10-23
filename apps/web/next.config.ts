import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@viewing/core", "@viewing/db"],
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] },
};

export default config;
