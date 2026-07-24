import { useState } from "react";
import { THEMES, THEME_KEYS } from "@/lib/konomi/themes";
import type { ThemeKey } from "@/lib/konomi/types";
import { GlyphCycle } from "./GlyphCycle";

interface ThemeSwitcherProps {
  value: ThemeKey;
  onChange: (key: ThemeKey) => void;
  // "bottom" (default): the original placement, below the swatches — every
  // existing caller keeps this unchanged. "left": for Masthead's condensed
  // sticky header specifically, whose own row is only --header-row-height
  // (36.5px) tall — a subtext appearing *below* the swatches there would
  // hang off the row's own bottom edge, over whatever page content has
  // scrolled beneath this sticky bar rather than over this component's own
  // surface, reading as detached/unreadable against arbitrary scrolled
  // content instead of the app's own surface. Left of the swatches instead
  // stays within the same row, over the same surface, at any scroll
  // position.
  subtextPlacement?: "bottom" | "left";
}

// Decorative flourish shown only in the hover subtext below the swatches —
// a one-off UI pairing for this interaction, not a design token (see
// DESIGN_SYSTEM.md's "decorative one-offs" note). Now a FLIPBOOK per theme
// (user, 2026-07-24): hold-hover steps through the frames on an interval
// and loops (GlyphCycle). Konomi = a garden growing in; Tide = fish
// swimming past (both user-supplied sequences); Newsprint = ink density
// pulsing ░▒▓ (PROPOSED — swap freely).
const HOVER_GLYPHS: Record<ThemeKey, string[]> = {
  default: ["𖡼", "𖤣", "𖥧", "𖡼", "𓋼", "𖤣", "𖥧", "𓋼", "𓍊"],
  // Tide v11 (user pattern 2026-07-24, comma-split into twelve composition
  // frames — a longer arc with a near-still center: the current thins to
  // the lone ོ mark at frame six, then rebuilds). Frames kept VERBATIM
  // from the user's cut (incl. leading/internal spaces; HTML collapses
  // runs of spaces to one, and ོ rides the space before it — frame six is
  // the COMBINING mark completely bare, the strongest dotted-circle
  // rendering risk yet; eyeball on-device). (v1-v10 all tried live first;
  // see git history.)
  dark: ["࿐", "𓂃༉", "⋆𓂃", "𓂃 ོ⋆", " ོ⋆", "ོ", "⋆ ོ", "⋆ ོ𓂃", " ོ⋆𓂃", "𓂃࿔", "࿔༉", "༉𓂃"],
  third: ["░", "▒", "▓", "▒", "░"],
};

export function ThemeSwitcher({ value, onChange, subtextPlacement = "bottom" }: ThemeSwitcherProps) {
  const [hovered, setHovered] = useState<ThemeKey | null>(null);

  // Narrow-collapsed tooltip horizontal anchor, PER hovered swatch — the
  // tooltip aligns to whichever swatch it describes rather than always
  // hugging the group's right edge (requested). The swatch group is a
  // `relative` flex-row of three 32px swatches with a --space-sm (6px) gap, so
  // relative to that box: Konomi (default, leftmost) aligns its own left edge
  // (left-0), Tide (dark, middle) aligns its left edge (32px + one gap), and
  // Newsprint (third, rightmost) aligns its right edge (right-0, flush to the
  // group's right border box). Only meaningful in the max-[456px] tooltip mode
  // (below), so every class here is media-gated; it's inert in the wider
  // left-of-swatches placement and in the expanded bottom hint. Base placement
  // sets `right-full` (right:100%), so the left-anchored cases must also reset
  // right to auto or they'd stretch between both edges. Falls back to the
  // Konomi/left-0 case when nothing is hovered (tooltip is invisible then, so
  // the exact anchor is moot — this just avoids an empty branch).
  const tooltipX =
    subtextPlacement !== "left"
      ? ""
      : hovered === "third"
        ? "max-[456px]:right-0"
        : hovered === "dark"
          ? "max-[456px]:right-auto max-[456px]:left-[calc(32px_+_var(--space-sm))]"
          : "max-[456px]:right-auto max-[456px]:left-0";

  return (
    // data-theme-switcher: lets MixerBar's click-outside-closes-edit-mode
    // listener allowlist the swatch buttons via a single closest() check —
    // see MixerBar.tsx's own comment on the allowlist.
    <div data-theme-switcher className="relative flex gap-[var(--space-sm)]">
      {THEME_KEYS.map((key) => {
        const t = THEMES[key];
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={t.name}
            onClick={() => onChange(key)}
            onMouseEnter={() => setHovered(key)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(key)}
            onBlur={() => setHovered(null)}
            className={[
              "w-[32px] h-[24px] p-0 cursor-pointer rounded-[var(--radius-chip)] border-[length:var(--border-base)] border-[var(--ink)]",
              active
                ? "shadow-[var(--elev-2)] -translate-x-px -translate-y-px opacity-100"
                : "shadow-none translate-x-0 translate-y-0 opacity-50",
            ].join(" ")}
            // Each swatch previews a specific (possibly inactive) palette's
            // raw colors, so it can't be expressed with the active theme's
            // CSS vars or as a finite set of static Tailwind classes.
            style={{
              background: `linear-gradient(135deg, ${t.surface} 0 42%, ${t.primary} 42% 72%, ${t.secondary} 72% 100%)`,
            }}
          />
        );
      })}
      {/* Replaces the native title-attribute tooltip: a custom subtext line
          alongside the whole swatch group instead of a per-swatch OS
          tooltip. Absolute (the same out-of-flow hint pattern used for
          LevelSelector/TagPool's hints elsewhere) so it doesn't reserve
          layout space while hidden — only opacity toggles on hover/focus.
          Placement is the one thing that varies (see subtextPlacement's
          own comment above): below the swatches by default, or to their
          left — vertically centered against the row via top-1/2
          -translate-y-1/2, matching the row's own items-center — for
          Masthead's condensed sticky header.

          COLLAPSED narrow-width override (the "left" placement only): the
          leftward subtext is whitespace-nowrap and un-chromed, so on a
          narrow collapsed row it paints straight over the KONOMI/ミックス
          wordmark to its left, unreadably (reported on mobile). Below a
          single fixed viewport breakpoint (max-[456px]) it flips to a BELOW
          tooltip instead — dropped top-full so it clears the wordmark
          entirely, horizontally anchored per-swatch (see tooltipX above), and
          given the SAME chrome as ResultCard's icon hints (surface bg, thin
          ink border, elev-1, mono text-2xs, sm/xs padding) so it stays legible
          over whatever page content has scrolled beneath this sticky row —
          which is exactly the objection that made "below" unusable WITHOUT
          chrome (see subtextPlacement's comment). The breakpoint is a single
          value (all three swatches flip together, not per-name) gauged off the
          LONGEST hint, "Newsprint ░". CDP-measured collapsed geometry: that
          hint keeps a full 12px clearance from the wordmark down to ~456px,
          and overlap begins just below it — so 456 is the strict no-overlap
          trigger, the widest point at which the tooltip is actually needed
          (shorter names like Konomi/Tide still have room here, but the
          breakpoint is single/worst-case by design). A looser 420 was tried to
          keep the left placement across more widths, then reverted to 456.
          Collapsed geometry is fixed except for viewport width (wordmark +
          swatches are fixed-size at progress 1, justify-between), so this
          reduces cleanly to one media query with no runtime measurement.
          Applies ONLY in this collapsed "left" mode — the expanded bottom hint
          is untouched. Bisected via CDP against "Newsprint ░"; re-check on-device. */}
      <span
        aria-hidden={!hovered}
        className={[
          "absolute whitespace-nowrap font-mono transition-opacity duration-150",
          subtextPlacement === "left"
            // mr-md (8px), was mr-xs (4px): with the glyph auto-box snug to
            // its frames, 4px read too tight against the swatches (reported).
            // 8px roughly balances "text end -> glyph center" (word space +
            // half box ≈ 10-13px) against "glyph center -> swatches" (half
            // box + this margin) — a token bump, not measured coupling.
            ? "right-full top-1/2 -translate-y-1/2 mr-[var(--space-md)] text-[length:var(--text-xs)] text-[var(--subtext)] " +
              "max-[456px]:top-full max-[456px]:translate-y-0 max-[456px]:mr-0 max-[456px]:mt-[var(--space-xs)] " +
              "max-[456px]:bg-[var(--surface)] max-[456px]:border-[length:var(--border-thin)] max-[456px]:border-[var(--ink)] max-[456px]:shadow-[var(--elev-1)] max-[456px]:px-[var(--space-sm)] max-[456px]:py-[var(--space-xs)] max-[456px]:text-[length:var(--text-2xs)] max-[456px]:text-[var(--ink)]"
            : "top-full left-0 mt-[var(--space-xs)] text-[length:var(--text-xs)] text-[var(--subtext)]",
          tooltipX,
          hovered ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {/* lowercase (user, 2026-07-24): display-only — THEMES keeps its
            proper names for aria-labels etc.; the class does the casing.
            key={hovered} restarts the flipbook from frame one when the
            hovered swatch changes. */}
        {hovered ? (
          <>
            <span className="lowercase">{THEMES[hovered].name}</span> <GlyphCycle key={hovered} glyphs={HOVER_GLYPHS[hovered]} active />
          </>
        ) : (
          ""
        )}
      </span>
    </div>
  );
}
