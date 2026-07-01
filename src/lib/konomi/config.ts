// App-behavior constants — distinct from src/lib/konomi/data.ts, which now
// holds only PLATFORMS (permanent mock data with no real data source).
export const DEFAULT_RESULT_COUNT = 5;
export const DEFAULT_ACCENT: "primary" | "secondary" = "secondary";
export const SHOW_HALFTONE = true;
export const SLOT_COUNT = 3;
// Level 3 (widest) tag pool threshold — the floor for a tag to appear in the
// pool at all. Genres always pass this (avgRank: 100) regardless of value.
export const AVG_RANK_BASELINE = 40;
