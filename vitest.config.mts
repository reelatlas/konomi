import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests only: the pure modules under src/lib/konomi (reducer, scoring,
// tag pool, wire format). Components and the Supabase adapters are not
// covered here — the smoke driver in .claude/skills/run-konomi stays the
// browser-level check.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
