import { useState } from "react";
import { THEMES, THEME_KEYS } from "@/lib/konomi/themes";
import type { ThemeKey } from "@/lib/konomi/types";

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
// DESIGN_SYSTEM.md's "decorative one-offs" note).
const HOVER_GLYPH: Record<ThemeKey, string> = {
  default: "❀",
  dark: "࿐",
  third: "░",
};

export function ThemeSwitcher({ value, onChange, subtextPlacement = "bottom" }: ThemeSwitcherProps) {
  const [hovered, setHovered] = useState<ThemeKey | null>(null);

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
          Masthead's condensed sticky header. */}
      <span
        aria-hidden={!hovered}
        className={[
          "absolute whitespace-nowrap font-mono text-[length:var(--text-xs)] text-[var(--subtext)] transition-opacity duration-150",
          subtextPlacement === "left" ? "right-full top-1/2 -translate-y-1/2 mr-[var(--space-xs)]" : "top-full left-0 mt-[var(--space-xs)]",
          hovered ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {hovered ? `${THEMES[hovered].name} ${HOVER_GLYPH[hovered]}` : ""}
      </span>
    </div>
  );
}
