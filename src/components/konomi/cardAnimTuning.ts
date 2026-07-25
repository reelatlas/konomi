import { DEFAULT_RESULT_COUNT } from "@/lib/konomi/config";

// Named constants for the result-card enter/exit animation
// (RecommendationsBody.tsx / ResultCard.tsx) — same convention as
// ROLL_DURATION_MS (RollingLabel.tsx) / EDIT_PANEL_TRANSITION_MS
// (MixerBar.tsx). Values settled twice: the original pass via a
// CardAnimDebugPanel (removed once settled), then re-tuned 2026-07-24 via
// AnimationDebugPanel for the timing rework (300→600 / 50→90 / 8→12,
// user-ruled). While that panel is mounted, the LIVE source is
// animationDebugStore's defaults — keep these mirrors in sync with it.
export const CARD_ANIM_DURATION_MS = 600;
export const CARD_ANIM_STAGGER_MS = 60;
export const CARD_ANIM_DISTANCE_PX = 12;
// Cubic-bezier control points, not a CSS `cubic-bezier(...)` string —
// ResultCard.tsx feeds these straight to Motion's `ease` (motion/react),
// which takes the same four numbers a CSS cubic-bezier() would, just as a
// plain tuple rather than CSS function syntax. Value unchanged from the
// pre-Motion CSS keyframes this replaced (see DESIGN_SYSTEM.md for that
// migration): cubic-bezier(0,0,.2,1) === [0, 0, 0.2, 1].
export const CARD_ANIM_EASE_IN: [number, number, number, number] = [0, 0, 0.2, 1];
export const CARD_ANIM_EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];

// Stagger scaling is RETIRED (step 0, user-ruled 2026-07-24): the stagger
// is flat at every width and lock count. History: the original model scaled
// proportionally ×(count/5) (getEffectiveStaggerMs, removed); the rework
// first generalized that to a per-card step, then tuning settled on step 0 —
// the "fewer cards → tighter cascade" idea didn't survive contact with the
// slower 600/60 sweep. getSteppedStaggerMs and this constant stay as the
// one-number seam to bring scaling back (raise the step) rather than
// re-deriving the machinery.
export const CARD_ANIM_STAGGER_STEP_MS = 0;

export function getSteppedStaggerMs(staggerMs: number, stepMs: number, cardCount: number): number {
  return Math.max(0, staggerMs - stepMs * (DEFAULT_RESULT_COUNT - cardCount));
}

// The reorder FLIP slide (locks/repeats compacting, ResultCard's
// layout="position"): 700ms on RECOMMEND, deliberately slower than the
// 600ms enter/exit sweep; 380ms after a Clear ✕ (user-ruled 2026-07-24) —
// Clear's slide runs sequentially AFTER the exit sweep, in isolation,
// where the same duration reads much slower than it does overlapping a
// RECOMMEND's enter sweep, so it gets roughly half the time.
export const CARD_SLIDE_DURATION_MS = 700;
export const CARD_CLEAR_SLIDE_DURATION_MS = 380;

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
export function getAnimatingPaceCount(ids: string[], locked: Record<string, boolean>, visibleTierCount: number): number {
  const windowIds = ids.slice(0, Math.min(visibleTierCount, ids.length));
  return windowIds.filter((t) => !locked[t]).length;
}
