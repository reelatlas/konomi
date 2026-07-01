import { SORT_OPTIONS } from "@/lib/konomi/tagPool";
import type { SortKey } from "@/lib/konomi/types";

interface SortSelectProps {
  value: SortKey;
  onChange: (key: SortKey) => void;
}

// First native <select> in the app — see DESIGN_SYSTEM.md for the pattern
// this establishes for any future one. `appearance-none` strips the
// browser's own chrome (which can't be restyled to match the hard-edged
// bordered look everything else uses) down to a plain box we style
// ourselves; the ▾ glyph is a separate pointer-events-none overlay standing
// in for the native dropdown arrow.
export function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="appearance-none bg-[var(--surface)] border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-2)] font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-sm)] uppercase text-[var(--ink)] py-[var(--space-md)] pl-[var(--space-lg)] pr-[var(--space-2xl)] cursor-pointer"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-[var(--space-md)] top-1/2 -translate-y-1/2 font-mono text-[length:var(--text-sm)] text-[var(--ink)]">
        ▾
      </span>
    </div>
  );
}
