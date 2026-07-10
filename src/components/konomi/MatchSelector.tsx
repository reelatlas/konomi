import { useEffect, useRef, useState } from "react";
import type { MatchKey } from "@/lib/konomi/types";
import { ROLL_DURATION_MS, RollingLabel } from "./RollingLabel";
import { useSupportsHover } from "./useSupportsHover";

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
  const supportsHover = useSupportsHover();
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
    setTimeout(() => {
      rollBusyRef.current = false;
    }, ROLL_DURATION_MS);
    onChange(nextMatch(value));
  }

  // Closes the collapsed hint on ANY outside pointerdown, not just this
  // button's own onBlur. See LevelSelector's own identical comment for the
  // full reasoning (a real, reported bug there: the hint persisted on a
  // real device in a way this control's own onBlur-only wiring apparently
  // didn't, most likely because LevelSelector/SortSelect's own neighbors
  // are mostly non-form-control chrome rather than the other buttons this
  // control sits beside here). Added here too for the same robustness,
  // even though this control wasn't the one reported as broken.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shown) return;
    function handlePointerDown(e: PointerEvent) {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setShown(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [shown]);

  if (collapsed) {
    return (
      <div ref={wrapperRef} className="relative flex border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-2)]">
        <button
          type="button"
          aria-label={HINTS[value]}
          onClick={handleCollapsedClick}
          // onMouseEnter/onMouseLeave/onBlur gated to supportsHover —
          // requested directly after a real, reported bug: RollingLabel
          // (below) restructures its own DOM on every value change (an
          // idle span swaps for a two-span rolling pair, then back), right
          // under the same point a touch tap just landed on. Confirmed
          // live as this app's own already-diagnosed pattern (ResultCard's
          // lock icon: swapping a child directly under the touch point can
          // trigger a spurious blur/mouseleave) — that spurious blur fired
          // right as a roll started, hiding this hint (setShown(false))
          // even though the tap never actually left the button, so the
          // roll animation visibly played but the subtext never showed
          // (or vanished too fast to register). Intermittent by nature —
          // it depends on real device paint/compositor timing this app
          // doesn't control, the same class of "can't repro in headless
          // Chromium, only on a real device" bug already documented
          // elsewhere in this file's history. On touch, dismissal already
          // has a reliable, timing-independent mechanism regardless (the
          // outside-pointerdown listener below), so onBlur/onMouseLeave
          // have nothing left to do there — only hover-capable devices
          // need them at all. onFocus stays unconditional: it's still
          // touch's own only way to show this hint in the first place.
          onMouseEnter={supportsHover ? () => setShown(true) : undefined}
          onMouseLeave={supportsHover ? () => setShown(false) : undefined}
          onFocus={() => setShown(true)}
          onBlur={supportsHover ? () => setShown(false) : undefined}
          // bg-surface/text-ink, the same colors an INACTIVE segment uses
          // in the full 3-segment form above, not bg-primary/text-surface
          // (the active segment's own colors, what this used before).
          // requested directly: a solid, colored single button read as a
          // pressed/active call-to-action (like Random or Recommend right
          // next to it), not as a neutral display of "this is the current
          // setting." Matching the inactive color instead reads as the
          // latter. RollingLabel (below) is what gives a tap its own
          // feedback now that color no longer visibly changes on click.
          className="py-[var(--space-md)] px-[var(--space-lg)] border-0 cursor-pointer uppercase font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-sm)] bg-[var(--surface)] text-[var(--ink)]"
        >
          <RollingLabel value={value} />
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
