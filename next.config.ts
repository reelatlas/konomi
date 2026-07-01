import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project — there are unrelated lockfiles
  // in parent directories that otherwise make Next.js guess wrong.
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // AniList shards cover images across s1-s4.anilist.co (and possibly
        // more in the future) — wildcard the subdomain rather than pinning
        // to whichever shard a handful of sample URLs happened to use.
        hostname: "**.anilist.co",
      },
    ],
  },
};

export default nextConfig;
