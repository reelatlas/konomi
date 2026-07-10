import { useRef, useState } from "react";
import { LEVEL_OPTIONS } from "@/lib/konomi/tagPool";
import type { LevelKey } from "@/lib/konomi/types";
import { ROLL_DURATION_MS, RollingLabel } from "./RollingLabel";

const LEVEL_LABELS = LEVEL_OPTIONS.map((o) => o.label);

interface LevelSelectorProps {
  value: LevelKey;
  onChange: (key: LevelKey) => void;
  // Final responsive step, driven entirely by the caller (MixerBar renders
  // two full sibling instances — one plain, one collapsed=true — each
  // hidden/shown via its own @max-[351px] container-query class, same
  // dual-render idiom as Random/Clear's icon⇄text swap, just container-
  // rather than viewport-scoped since this row already keys its own
  // label-hide off a container query). Collapsed swaps the 3-segment row
  // for one button hugging the active word's own width (unlike
  // MatchSelector's fixed-width digit, these labels vary in length), tap
  // cycles Casual→Seasoned→Otaku→Casual.
  collapsed?: boolean;
}

function nextLevel(key: LevelKey): LevelKey {
  const i = LEVEL_OPTIONS.findIndex((o) => o.key === key);
  return LEVEL_OPTIONS[(i + 1) % LEVEL_OPTIONS.length].key;
}

// Same segmented-button structure as MatchSelector/SortSelect — a separate
// component rather than a generalized shared one, since MatchSelector's
// contract (values are the labels) doesn't fit custom labels like
// "Casual"/"Otaku". Each option's hint now shows as a custom subtext below
// the whole segmented row on hover/focus of that specific segment — the
// same pattern ThemeSwitcher's swatches use — not a native `title` tooltip
// (hence `aria-label`, not `title`, on each button) and not a single shared
// line for just the active option.
export function LevelSelector({ value, onChange, collapsed }: LevelSelectorProps) {
  const [hovered, setHovered] = useState<LevelKey | null>(null);
  const hoveredOption = LEVEL_OPTIONS.find((o) => o.key === hovered);
  const activeOption = LEVEL_OPTIONS.find((o) => o.key === value)!;
  // Collapsed's own reveal state, separate from `hovered` above — that one
  // tracks *which segment* is being previewed among 3 (a hover-preview of a
  // value that isn't necessarily active yet); collapsed has only one button
  // showing the live active option, so there's nothing to distinguish by
  // key. A plain boolean plus reading activeOption directly (not a captured
  // snapshot) is what makes the hint auto-advance on every click: onFocus
  // and onClick fire from the same tap and land in the same React batch, so
  // by the time this renders, `value`/activeOption is already the newly-
  // cycled one — each subsequent tap (already focused, onFocus doesn't
  // refire) still updates the hint because it's derived from `value`, not
  // stored. Same onFocus/onBlur show/dismiss wiring as the lock icon's
  // already-working mobile tap-hint (ResultCard.tsx) — tap shows it, tap
  // elsewhere blurs it.
  const [shown, setShown] = useState(false);
  // Gates the collapsed button's own onClick against firing a second
  // onChange before RollingLabel's own roll (triggered by the FIRST click)
  // has actually finished. A plain ref, not state, since gating a click
  // doesn't need to re-render anything itself. Requested directly after a
  // real, reported bug on mobile: rapidly tapping this same control many
  // times in a row eventually stopped registering taps at all, then later
  // taps landed as if hitting a different element entirely, the same
  // family of real-device WebKit compositor desync this app has already
  // hit and fixed once before (MixerBar's edit-mode "mashing an empty slot
  // glitches everything" bug, see DESIGN_SYSTEM.md), whose own root lesson
  // was: don't hand the compositor a sudden, discontinuous change to
  // mishandle. Interrupting one roll mid-flight to immediately start
  // another is exactly that kind of discontinuity. Blocking overlapping
  // rolls at the source, rather than trying to make RollingLabel itself
  // handle being interrupted cleanly, is the same "don't cause the
  // discontinuity in the first place" fix applied to a new instance of the
  // same class of bug.
  const rollBusyRef = useRef(false);
  function handleCollapsedClick() {
    if (rollBusyRef.current) return;
    rollBusyRef.current = true;
    setTimeout(() => {
      rollBusyRef.current = false;
    }, ROLL_DURATION_MS);
    onChange(nextLevel(value));
  }

  if (collapsed) {
    return (
      <div className="relative flex border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-2)]">
        <button
          type="button"
          aria-label={activeOption.hint}
          onClick={handleCollapsedClick}
          onMouseEnter={() => setShown(true)}
          onMouseLeave={() => setShown(false)}
          onFocus={() => setShown(true)}
          onBlur={() => setShown(false)}
          // bg-surface/text-ink, matching an INACTIVE segment's own colors
          // above, not bg-primary/text-surface (the active segment's
          // colors, what this used before). See MatchSelector's own
          // identical comment for the full reasoning, shared verbatim
          // across all three of this row's collapsed controls.
          className="py-[var(--space-md)] px-[var(--space-lg)] border-0 cursor-pointer uppercase font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-sm)] whitespace-nowrap bg-[var(--surface)] text-[var(--ink)]"
        >
          <RollingLabel value={activeOption.label} sizeToWidestOf={LEVEL_LABELS} />
        </button>
        <span
          aria-hidden={!shown}
          className={[
            "absolute top-full left-0 mt-[var(--space-sm)] whitespace-nowrap font-mono text-[length:var(--text-xs)] text-[var(--subtext)] transition-opacity duration-150",
            shown ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          {shown ? activeOption.hint : ""}
        </span>
      </div>
    );
  }

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
        // top-full/mt-sm, back to below the control — this filter now
        // lives in MixerBar's resize-handle row, at the very top of the
        // edit card, with nothing above it but the card's own border/
        // padding and nothing directly below it that above-positioning
        // was ever protecting against (that was TagPoolBody's combined
        // tabs+filters row, which this control no longer sits in — see
        // git history for that bug). mt-sm (6px), not mb-xs (4px): the
        // original below-positioned value, which clears this control's
        // own shadow-[var(--elev-2)] (3px bottom bleed) plus a bit more —
        // there's no equivalent top-edge bleed to account for the way the
        // above-positioned version needed the smaller gap for.
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
