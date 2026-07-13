import { useRef } from "react";
import { SORT_OPTIONS } from "@/lib/konomi/tagPool";
import type { SortKey } from "@/lib/konomi/types";
import { getAnimationDebugValues } from "./animationDebugStore";
import { RollingLabel } from "./RollingLabel";

const SORT_LABELS = SORT_OPTIONS.map((o) => o.label);

interface SortSelectProps {
  value: SortKey;
  onChange: (key: SortKey) => void;
  // Final responsive step, driven entirely by the caller (MixerBar renders
  // two full sibling instances — one plain, one collapsed=true — each
  // hidden/shown via the same @max-[352px] container-query class Level's
  // own collapse uses, so both filter controls step down together). Swaps
  // the native <select> for one button hugging the current label's own
  // width, tap cycles Popular→Unpopular→A-Z→Z-A→Popular. No hover/tap hint
  // span here unlike MatchSelector/LevelSelector's collapsed forms — there's
  // no hint data for SORT_OPTIONS (unlike LEVEL_OPTIONS's key/label/hint),
  // and there's nothing to explain: "Popular"/"A-Z" already say what they
  // do, unlike "Casual"/"Otaku" which need the subtext to mean anything.
  // Inventing hint copy just to fill that slot would be backwards.
  collapsed?: boolean;
}

function nextSort(key: SortKey): SortKey {
  return SORT_OPTIONS[(SORT_OPTIONS.findIndex((o) => o.key === key) + 1) % SORT_OPTIONS.length].key;
}

// A native <select>, not a segmented control — this app's first version of
// this control WAS a native select, later replaced with a segmented row to
// match LevelSelector's shape (see DESIGN_SYSTEM.md). Moving back is a
// deliberate choice this time, not a regression: a 4-option dropdown reads
// as more standard/compact than 4 segmented buttons, and there's no longer
// a "match LevelSelector's shape" pressure forcing this control's own shape
// — Level still uses the same hover-subtext hint pattern LevelSelector
// always has (never actually moved to per-segment title tooltips; an
// earlier draft of that change was tried and reverted). `appearance-none`
// strips the native
// arrow so the custom "▾" (matching this app's own bordered/shadow control
// style) replaces it — the same restyling approach DESIGN_SYSTEM.md's
// now-removed note already flagged as the right starting point if a select
// ever came back.
export function SortSelect({ value, onChange, collapsed }: SortSelectProps) {
  // Gates the collapsed button's own onClick against firing a second
  // onChange before RollingLabel's own roll (triggered by the FIRST click)
  // has actually finished. See LevelSelector's own identical comment for
  // the full reasoning (a real, reported mobile bug: rapid taps eventually
  // stopped registering, then later taps landed on the wrong element,
  // matching this app's own already-diagnosed real-device WebKit
  // compositor-desync family of bug).
  const rollBusyRef = useRef(false);
  function handleCollapsedClick() {
    if (rollBusyRef.current) return;
    rollBusyRef.current = true;
    // Live value, not the static import — see RollingLabel.tsx's own
    // comment on ROLL_DURATION_MS for why this reads the debug-panel-
    // tweakable duration instead.
    setTimeout(() => {
      rollBusyRef.current = false;
    }, getAnimationDebugValues().rollDurationMs);
    onChange(nextSort(value));
  }

  if (collapsed) {
    const activeOption = SORT_OPTIONS.find((o) => o.key === value)!;
    return (
      <div className="relative flex border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-2)]">
        <button
          type="button"
          aria-label={activeOption.label}
          onClick={handleCollapsedClick}
          // bg-surface/text-ink, matching the wide form's own native
          // <select> colors, not bg-primary/text-surface (what this used
          // before). See MatchSelector's own identical comment for the
          // full reasoning, shared verbatim across all three of this row's
          // collapsed controls.
          // leading-[16px]: whole 32px box, matching MatchSelector's collapsed
          // form so this filter's single button lines up with min-match and
          // Tag Density at the same height (see MatchSelector's own comment).
          className="py-[var(--space-md)] leading-[16px] px-[var(--space-lg)] border-0 cursor-pointer uppercase font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-sm)] whitespace-nowrap bg-[var(--surface)] text-[var(--ink)]"
        >
          <RollingLabel value={activeOption.label} sizeToWidestOf={SORT_LABELS} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        // leading-[16px]: whole 32px control height (16 padding + 16 line),
        // matching the segmented min-match/density controls so this <select>
        // sits at the same height as the rest of the filter row rather than
        // the browser's default ~32.5px line-height for text-xs.
        className="appearance-none leading-[16px] bg-[var(--surface)] border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-2)] font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-sm)] uppercase text-[var(--ink)] pl-[var(--space-lg)] pr-[var(--space-2xl)] py-[var(--space-md)] cursor-pointer"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-[var(--space-md)] top-1/2 -translate-y-1/2 font-mono text-[length:var(--text-sm)] text-[var(--ink)]"
      >
        ▾
      </span>
    </div>
  );
}
