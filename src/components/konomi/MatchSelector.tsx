import { useState } from "react";
import type { MatchKey } from "@/lib/konomi/types";

const OPTIONS: MatchKey[] = ["1", "2", "3"];

// "3" reads "match all 3 tags", not "match 3+ tags" — with only 3 slots
// total, "3+" and "all 3" are the same requirement, and "all" is the
// clearer, more natural phrasing for the ceiling option specifically.
const HINTS: Record<MatchKey, string> = {
  "1": "match 1+ tag",
  "2": "match 2+ tags",
  "3": "match all 3 tags",
};

interface MatchSelectorProps {
  value: MatchKey;
  onChange: (key: MatchKey) => void;
}

export function MatchSelector({ value, onChange }: MatchSelectorProps) {
  const [hovered, setHovered] = useState<MatchKey | null>(null);

  return (
    <div className="relative flex border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-2)]">
      {OPTIONS.map((key, i) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={HINTS[key]}
            onClick={() => onChange(key)}
            onMouseEnter={() => setHovered(key)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(key)}
            onBlur={() => setHovered(null)}
            className={[
              // Matches LevelSelector's segment sizing exactly (py-md/px-lg,
              // text-xs, tracking-sm) — one consistent segmented-control
              // size across the app, not a MatchSelector-specific one.
              "flex-1 py-[var(--space-md)] px-[var(--space-lg)] border-0 cursor-pointer uppercase font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-sm)]",
              i > 0 ? "border-l-[length:var(--border-thin)] border-l-[var(--ink)]" : "",
              active ? "bg-[var(--primary)] text-[var(--surface)]" : "bg-[var(--surface)] text-[var(--ink)]",
            ].join(" ")}
          >
            {key}
          </button>
        );
      })}
      {/* Same hover/focus-subtext pattern as LevelSelector/ThemeSwitcher —
          mt-sm (not mt-xs), same reason as LevelSelector: this control
          shares the same shadow-[var(--elev-2)] (3px hard offset), so mt-xs
          would leave the subtext blending into the shadow. */}
      <span
        aria-hidden={!hovered}
        className={[
          "absolute top-full left-0 mt-[var(--space-sm)] whitespace-nowrap font-mono text-[length:var(--text-xs)] text-[var(--muted)] transition-opacity duration-150",
          hovered ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {hovered ? HINTS[hovered] : ""}
      </span>
    </div>
  );
}
