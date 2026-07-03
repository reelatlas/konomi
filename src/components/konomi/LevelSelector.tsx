import { useState } from "react";
import { LEVEL_OPTIONS } from "@/lib/konomi/tagPool";
import type { LevelKey } from "@/lib/konomi/types";

interface LevelSelectorProps {
  value: LevelKey;
  onChange: (key: LevelKey) => void;
}

// Same segmented-button structure as MatchSelector/SortSelect — a separate
// component rather than a generalized shared one, since MatchSelector's
// contract (values are the labels) doesn't fit custom labels like
// "Casual"/"Otaku". Each option's hint now shows as a custom subtext below
// the whole segmented row on hover/focus of that specific segment — the
// same pattern ThemeSwitcher's swatches use — not a native `title` tooltip
// (hence `aria-label`, not `title`, on each button) and not a single shared
// line for just the active option.
export function LevelSelector({ value, onChange }: LevelSelectorProps) {
  const [hovered, setHovered] = useState<LevelKey | null>(null);
  const hoveredOption = LEVEL_OPTIONS.find((o) => o.key === hovered);

  return (
    <div className="relative flex border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-2)]">
      {LEVEL_OPTIONS.map((option, i) => {
        const active = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            aria-label={option.hint}
            onClick={() => onChange(option.key)}
            onMouseEnter={() => setHovered(option.key)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(option.key)}
            onBlur={() => setHovered(null)}
            className={[
              "flex-1 py-[var(--space-md)] px-[var(--space-lg)] border-0 cursor-pointer uppercase font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-sm)] whitespace-nowrap",
              i > 0 ? "border-l-[length:var(--border-thin)] border-l-[var(--ink)]" : "",
              active ? "bg-[var(--primary)] text-[var(--surface)]" : "bg-[var(--surface)] text-[var(--ink)]",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
      <span
        aria-hidden={!hoveredOption}
        // mt-sm (6px), not mt-xs (4px) like ThemeSwitcher's equivalent
        // subtext: this control's own shadow-[var(--elev-2)] drops a solid
        // 3px below its box, so mt-xs left only ~1px of actual clear space
        // before the subtext started — visually blending into the shadow.
        // ThemeSwitcher's swatches don't carry a shadow this deep, so its
        // mt-xs never had the same problem.
        className={[
          "absolute top-full left-0 mt-[var(--space-sm)] whitespace-nowrap font-mono text-[length:var(--text-xs)] text-[var(--subtext)] transition-opacity duration-150",
          hoveredOption ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {hoveredOption?.hint ?? ""}
      </span>
    </div>
  );
}
