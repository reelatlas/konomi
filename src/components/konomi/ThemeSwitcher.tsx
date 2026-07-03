import { useState } from "react";
import { THEMES, THEME_KEYS } from "@/lib/konomi/themes";
import type { ThemeKey } from "@/lib/konomi/types";

interface ThemeSwitcherProps {
  value: ThemeKey;
  onChange: (key: ThemeKey) => void;
}

// Decorative flourish shown only in the hover subtext below the swatches —
// a one-off UI pairing for this interaction, not a design token (see
// DESIGN_SYSTEM.md's "decorative one-offs" note).
const HOVER_GLYPH: Record<ThemeKey, string> = {
  default: "❀",
  dark: "࿐",
  third: "░",
};

export function ThemeSwitcher({ value, onChange }: ThemeSwitcherProps) {
  const [hovered, setHovered] = useState<ThemeKey | null>(null);

  return (
    <div className="relative flex gap-[var(--space-sm)]">
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
          below the whole swatch group instead of a per-swatch OS tooltip.
          Absolute + top-full (the same out-of-flow hint pattern used for
          LevelSelector/TagPool's hints elsewhere) so it doesn't reserve
          layout space while hidden — only opacity toggles on hover/focus. */}
      <span
        aria-hidden={!hovered}
        className={[
          "absolute top-full left-0 mt-[var(--space-xs)] whitespace-nowrap font-mono text-[length:var(--text-xs)] text-[var(--subtext)] transition-opacity duration-150",
          hovered ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {hovered ? `${THEMES[hovered].name} ${HOVER_GLYPH[hovered]}` : ""}
      </span>
    </div>
  );
}
