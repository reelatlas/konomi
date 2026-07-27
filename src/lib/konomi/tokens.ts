// Single source of truth for non-color design tokens. Mirrored as CSS
// custom properties in src/app/globals.css `:root` for Tailwind consumption
// (e.g. `gap-[var(--space-md)]`) — keep both in sync.

export const FONTS = {
  display: "'Anton', sans-serif",
  body: "'Zen Kaku Gothic New', sans-serif",
  mono: "'IBM Plex Mono', monospace",
} as const;

export const FONT_WEIGHTS = {
  bold: 700,
  black: 900,
} as const;

export const LEADING = {
  display: 0.86,
  tight: 1.05,
} as const;

// Letter-spacing scale: 0.01 · 0.02 · 0.03 · 0.04 · 0.06 · 0.08em
export const TRACKING = {
  xs: "0.01em",
  sm: "0.02em",
  md: "0.03em",
  lg: "0.04em",
  xl: "0.06em",
  "2xl": "0.08em",
} as const;

export const TYPE_SCALE = {
  wordmark: "clamp(44px, 8vw, 78px)",
  wordmarkJp: "clamp(22px, 4vw, 38px)",
  cover: "120px",
  "2xl": "30px",
  xl: "26px",
  lg: "20px",
  md: "18px",
  base: "14px", // the committed reading size (synopsis + empty-state lines) — see SIZING_AUDIT.md §6
  sm: "12px",
  xs: "11px",
  "2xs": "10px",
} as const;

// 4 · 6 · 8 · 12 · 16 · 24 · 32 · 48 · 60
export const SPACE = {
  xs: "4px",
  sm: "6px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  "2xl": "24px",
  "3xl": "32px",
  huge: "48px",
  page: "60px",
} as const;

// Two steps (user-ruled 2026-07-26 — see globals.css border comment /
// SIZING_AUDIT.md): hair for badges/hairlines, base 2px for everything
// else. `thin` deleted — the 2/2.5 split never rendered on Chromium and
// only barely on iOS; no hierarchy was intended.
export const BORDERS = {
  hair: "1.5px",
  base: "2px",
} as const;

// Control-height scale (search-v2 unification, ruled 2026-07-26 — see
// docs/audits/SIZING_AUDIT.md §6): TWO tiers, assigned by ROW, never by
// component. md = the control tier (header row, mixbar, segments,
// RECOMMEND); sm = the dense tier (chips, tabs, card + panel icon
// buttons). Fixed heights always — padding-derived control boxes are
// banned (the ActionButton glyph-metrics lesson).
export const CONTROL_H = {
  md: "44px",
  sm: "30px",
} as const;

export const RADII = {
  none: "0",
  chip: "2px",
} as const;

// Hard manga offset-shadows: `<offset> 0 <ink>`. Combine with the active
// theme's ink color at the usage site, e.g. `shadow-[var(--elev-3)]`.
// Two offsets (2 and 3) also have a `-accent` variant in globals.css
// (`--elev-2-accent`, `--elev-3-accent`) that swaps in the theme's secondary
// color instead of ink, for "selected/filled" states that pop against it.
export const ELEVATION = {
  1: "2px 2px 0",
  2: "3px 3px 0",
  3: "4px 4px 0",
  4: "5px 5px 0",
  5: "8px 8px 0",
} as const;
