import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project — there are unrelated lockfiles
  // in parent directories that otherwise make Next.js guess wrong.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
