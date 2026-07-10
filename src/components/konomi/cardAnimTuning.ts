import { DEFAULT_RESULT_COUNT } from "@/lib/konomi/config";

// Named constants for the result-card enter/exit animation
// (RecommendationsBody.tsx / ResultCard.tsx) — same convention as
// ROLL_DURATION_MS (RollingLabel.tsx) / EDIT_PANEL_TRANSITION_MS
// (MixerBar.tsx). These were live-tweakable via a CardAnimDebugPanel
// (useSyncExternalStore-backed store, matching RecommendationsBody.tsx's
// own empty-state shuffle-bag pattern) while dialing in the feel; that
// panel and its store plumbing were removed once these five values were
// settled — see DESIGN_SYSTEM.md for the tuning story. Retune by editing
// these numbers directly.
export const CARD_ANIM_DURATION_MS = 300;
export const CARD_ANIM_STAGGER_MS = 50;
export const CARD_ANIM_DISTANCE_PX = 8;
export const CARD_ANIM_EASE_IN = "cubic-bezier(0,0,.2,1)";
export const CARD_ANIM_EASE_OUT = "cubic-bezier(0,0,.2,1)";

// CARD_ANIM_STAGGER_MS is the value AT DEFAULT_RESULT_COUNT (5) cards — as
// fewer cards are actually sweeping (a narrower carousel tier, some locked
// and excluded — see getAnimatingPaceCount below), the sweep tightens
// proportionally rather than staying fixed: fewer cards already read as a
// shorter row, so the same absolute stagger would either drag the sweep
// out disproportionately (exit) or make the cascade barely register
// (enter, only 2-3 cards). Proportional to DEFAULT_RESULT_COUNT, not a
// hardcoded lookup table, so retuning CARD_ANIM_STAGGER_MS above rescales
// every card-count case with it — 5→full value, 4→4/5, 3→3/5, matching
// "reduce by ~10ms per card fewer" at the 50ms default (50/5 = 10ms/card)
// without hardcoding that 10ms anywhere.
export function getEffectiveStaggerMs(staggerMs: number, cardCount: number): number {
  return (staggerMs * cardCount) / DEFAULT_RESULT_COUNT;
}

// Mirrors ResultCard.tsx's own card-width breakpoints exactly
// (max-[1152px]/min-[993px]/min-[741px]/min-[501px]) — re-derive both
// together if either ever changes. Kept as a mirrored constant, not a
// shared one: Tailwind's arbitrary-value classes need literal static text
// for its build-time scanner to generate CSS for them at all (see
// IconButton.tsx's BORDER_CLASSES/MixerBar.tsx's own spacer-constant
// comments for the same constraint elsewhere in this app), so there's no
// single source of truth these two could actually share directly — this
// is the JS-side mirror of a breakpoint set that only otherwise exists as
// literal Tailwind class text.
const CARD_VISIBLE_TIER_BREAKPOINTS: { minWidth: number; count: number }[] = [
  { minWidth: 1152, count: 5 },
  { minWidth: 993, count: 4 },
  { minWidth: 741, count: 3 },
  { minWidth: 501, count: 2 },
  { minWidth: 0, count: 1 },
];

export function getVisibleCardTierCount(width: number): number {
  for (const bp of CARD_VISIBLE_TIER_BREAKPOINTS) {
    if (width >= bp.minWidth) return bp.count;
  }
  return 1;
}

// How many cards are actually sweeping in/out right now, for stagger-PACE
// purposes only — the current breakpoint tier's nominal visible count
// (above), clamped to however many are actually displayed, minus whichever
// of those are currently locked (locked cards never animate, so they
// shouldn't count toward "how many are visibly sweeping"). Deliberately
// reads live `locked`, not newTitles/isEntering — this is a different
// question from "does this specific card play the animation" (which must
// stay decoupled from live lock state to avoid replaying on a lock/unlock
// toggle, see useKonomi.ts's own comment on newTitles): pace is a purely
// cosmetic "how tight should the sweep read right now" question, so it's
// correct (and requested) for it to react live to lock changes even though
// isEntering itself must not.
export function getAnimatingPaceCount(titles: string[], locked: Record<string, boolean>, visibleTierCount: number): number {
  const windowTitles = titles.slice(0, Math.min(visibleTierCount, titles.length));
  return windowTitles.filter((t) => !locked[t]).length;
}
