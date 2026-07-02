import { LEVEL_OPTIONS } from "@/lib/konomi/tagPool";
import type { LevelKey } from "@/lib/konomi/types";

interface LevelSelectorProps {
  value: LevelKey;
  onChange: (key: LevelKey) => void;
}

// Same segmented-button structure as MatchSelector/SortSelect — a separate
// component rather than a generalized shared one, since MatchSelector's
// contract (values are the labels) doesn't fit custom labels like
// "Casual"/"Otaku". The hint for whatever's currently selected renders once,
// below the whole segmented row, rather than inside every segment at once —
// always right-aligned to this control's own right edge, fixed regardless
// of which segment is active (deliberately not position-tracking, so it
// stays visually stable as the level changes).
//
// The hint is `absolute`, not normal flow: it needs to hang below the
// button row without contributing to this component's own layout height, so
// a parent comparing this control's real (button-row-only) height against
// something else — see TagPoolSection's header row — compares like with
// like instead of getting thrown off by trailing hint text.
export function LevelSelector({ value, onChange }: LevelSelectorProps) {
  const activeOption = LEVEL_OPTIONS.find((option) => option.key === value);

  return (
    <div className="relative">
      <div className="flex border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-2)]">
        {LEVEL_OPTIONS.map((option, i) => {
          const active = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onChange(option.key)}
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
      </div>
      {activeOption && (
        <div className="absolute top-full inset-x-0 mt-[var(--space-xs)] text-right font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xs)] text-[var(--muted)]">
          {activeOption.hint}
        </div>
      )}
    </div>
  );
}
