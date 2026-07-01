import type { MatchKey } from "@/lib/konomi/types";

const OPTIONS: MatchKey[] = ["1", "2", "3"];

interface MatchSelectorProps {
  value: MatchKey;
  onChange: (key: MatchKey) => void;
}

export function MatchSelector({ value, onChange }: MatchSelectorProps) {
  return (
    <div className="flex border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-2)]">
      {OPTIONS.map((key, i) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={[
              "flex-1 py-[var(--space-md)] px-[var(--space-xs)] border-0 cursor-pointer uppercase font-mono font-bold text-[length:var(--text-base)]",
              i > 0 ? "border-l-[length:var(--border-thin)] border-l-[var(--ink)]" : "",
              active ? "bg-[var(--primary)] text-[var(--surface)]" : "bg-[var(--surface)] text-[var(--ink)]",
            ].join(" ")}
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
