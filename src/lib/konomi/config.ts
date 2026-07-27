// App-behavior constants.
export const DEFAULT_RESULT_COUNT = 5;
// Which pop color RECOMMEND (the cta variant) wears — "accent" is the
// bright pop (renamed from "secondary" 2026-07-26).
export const DEFAULT_ACCENT: "primary" | "accent" = "accent";
export const SHOW_HALFTONE = true;
export const SLOT_COUNT = 3;
// Level 3 ("All", widest) tag pool threshold — the floor for a real tag to
// appear in the pool at all. Genres always pass every level (avgRank: 100)
// regardless of value.
export const AVG_RANK_BASELINE = 40;
// Level 2 ("Popular") thresholds — a real tag must clear BOTH to show.
export const POPULAR_AVG_RANK_THRESHOLD = 70;
export const POPULAR_SERIES_COUNT_PCT = 0.05;
