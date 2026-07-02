import { SORT_OPTIONS } from "@/lib/konomi/tagPool";
import type { SortKey } from "@/lib/konomi/types";

interface SortSelectProps {
  value: SortKey;
  onChange: (key: SortKey) => void;
}

// Same segmented-button structure as MatchSelector/LevelSelector — replaces
// an earlier native <select> version (see DESIGN_SYSTEM.md's now-removed
// "first native select" note) so both tag pool controls share one visual
// pattern.
export function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <div className="flex border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-2)]">
      {SORT_OPTIONS.map((option, i) => {
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
  );
}
