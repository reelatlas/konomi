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
  // Final responsive step, driven entirely by the caller (MixerBar renders
  // two full sibling instances — one plain, one collapsed=true — each
  // hidden/shown via its own max-[451px] viewport class, same dual-render
  // idiom as Random/Clear's icon⇄text swap). Collapsed swaps the 3-segment
  // row for one button showing just the active value, tapping cycles
  // 1→2→3→1 — shortest possible width, no chevrons.
  collapsed?: boolean;
}

function nextMatch(key: MatchKey): MatchKey {
  return OPTIONS[(OPTIONS.indexOf(key) + 1) % OPTIONS.length];
}

export function MatchSelector({ value, onChange, collapsed }: MatchSelectorProps) {
  const [hovered, setHovered] = useState<MatchKey | null>(null);
  // Collapsed's own reveal state, separate from `hovered` above — that one
  // tracks *which segment* is being previewed among 3 (a hover-preview of a
  // value that isn't necessarily active yet); collapsed has only one button
  // showing the live active value, so there's nothing to distinguish by key.
  // A plain boolean plus reading HINTS[value] directly (not a captured
  // snapshot) is what makes the hint auto-advance on every click: onFocus
  // and onClick fire from the same tap and land in the same React batch, so
  // by the time this renders, `value` is already the newly-cycled one —
  // each subsequent tap (already focused, onFocus doesn't refire) still
  // updates the hint because it's derived from `value`, not stored. Same
  // onFocus/onBlur show/dismiss wiring as the lock icon's already-working
  // mobile tap-hint (ResultCard.tsx) — tap shows it, tap elsewhere blurs it.
  const [shown, setShown] = useState(false);

  if (collapsed) {
    return (
      <div className="relative flex border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-2)]">
        <button
          type="button"
          aria-label={HINTS[value]}
          onClick={() => onChange(nextMatch(value))}
          onMouseEnter={() => setShown(true)}
          onMouseLeave={() => setShown(false)}
          onFocus={() => setShown(true)}
          onBlur={() => setShown(false)}
          className="py-[var(--space-md)] px-[var(--space-lg)] border-0 cursor-pointer uppercase font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-sm)] bg-[var(--primary)] text-[var(--surface)]"
        >
          {value}
        </button>
        <span
          aria-hidden={!shown}
          className={[
            "absolute top-full left-0 mt-[var(--space-sm)] whitespace-nowrap font-mono text-[length:var(--text-xs)] text-[var(--subtext)] transition-opacity duration-150",
            shown ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          {shown ? HINTS[value] : ""}
        </span>
      </div>
    );
  }

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
          "absolute top-full left-0 mt-[var(--space-sm)] whitespace-nowrap font-mono text-[length:var(--text-xs)] text-[var(--subtext)] transition-opacity duration-150",
          hovered ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {hovered ? HINTS[hovered] : ""}
      </span>
    </div>
  );
}
