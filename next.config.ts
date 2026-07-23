import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project — there are unrelated lockfiles
  // in parent directories that otherwise make Next.js guess wrong.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // The app lives at explicit per-side routes (/anime today, /film next) so
  // the URL always names the catalog partition — see src/lib/konomi/domain.ts.
  // A config-level redirect (real HTTP 307, checked before any rendering),
  // NOT a page calling redirect(): a statically prerendered redirect page
  // degrades to a meta-refresh with a visible ~1s blank flash, confirmed
  // live against the production build. permanent: false deliberately — the
  // destination may later become "last-visited side," and browsers cache
  // 308s forever.
  async redirects() {
    return [
      {
        source: "/",
        destination: "/anime",
        permanent: false,
      },
    ];
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
