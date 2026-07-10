import { useSyncExternalStore } from "react";
import { DEFAULT_RESULT_COUNT } from "@/lib/konomi/config";

// Live-tweakable constants for the result-card enter/exit animation
// (RecommendationsBody.tsx / ResultCard.tsx). Shaped exactly like
// RecommendationsBody.tsx's own empty-state headline shuffle-bag (module
// vars + a listener Set + useSyncExternalStore) — a proven pattern in this
// codebase for "one piece of module state that isn't React state, but
// still needs every subscribed component to re-render when it changes."
//
// Named to match the constants the original spec asked for directly:
// CARD_ANIM_DURATION_MS/CARD_ANIM_STAGGER_MS/CARD_ANIM_DISTANCE_PX/
// CARD_ANIM_EASE_IN/CARD_ANIM_EASE_OUT — kept here as one object's fields
// rather than five separate top-level consts specifically so they can be
// live-edited as a group via CardAnimDebugPanel.tsx while testing, then
// hardcoded back to plain constants (or left as-is; this module works
// standalone with these defaults either way) once the desired feel is
// found. See CardAnimDebugPanel.tsx's own comment for the removal story.
export interface CardAnimTuning {
  durationMs: number;
  staggerMs: number;
  distancePx: number;
  easeIn: string;
  easeOut: string;
}

export const CARD_ANIM_DEFAULTS: CardAnimTuning = {
  durationMs: 300,
  staggerMs: 50,
  distancePx: 8,
  easeIn: "cubic-bezier(0,0,.2,1)",
  easeOut: "cubic-bezier(0,0,.2,1)",
};

let cardAnimTuning: CardAnimTuning = { ...CARD_ANIM_DEFAULTS };
const listeners = new Set<() => void>();

export function getCardAnimTuning(): CardAnimTuning {
  return cardAnimTuning;
}

// Fixed to the defaults, same as the empty-state bag's own server
// snapshot — this value is never itself hydration-sensitive (nothing here
// is randomized), but returning a stable reference keeps this hook usable
// from server-rendered components without needing its own opt-out.
function getServerSnapshot(): CardAnimTuning {
  return CARD_ANIM_DEFAULTS;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// The only mutator — used by CardAnimDebugPanel.tsx. Replaces the whole
// object (not a per-field mutation) so every subscriber sees one
// consistent snapshot, then notifies.
export function setCardAnimTuning(partial: Partial<CardAnimTuning>): void {
  cardAnimTuning = { ...cardAnimTuning, ...partial };
  listeners.forEach((listener) => listener());
}

export function resetCardAnimTuning(): void {
  cardAnimTuning = { ...CARD_ANIM_DEFAULTS };
  listeners.forEach((listener) => listener());
}

export function useCardAnimTuning(): CardAnimTuning {
  return useSyncExternalStore(subscribe, getCardAnimTuning, getServerSnapshot);
}

// staggerMs (from tuning/the debug panel) is the value AT DEFAULT_RESULT_COUNT
// (5) cards — as fewer cards are actually on screen (a smaller catalog, a
// clear that leaves only a couple locked cards mid-exit, etc.), the sweep
// tightens proportionally rather than staying fixed: fewer cards already
// read as a shorter row, so the same absolute stagger would either drag the
// sweep out disproportionately (exit) or make the cascade barely register
// (enter, only 2-3 cards). Proportional to DEFAULT_RESULT_COUNT, not a
// separate hardcoded lookup table, so a debug-panel edit to the base
// staggerMs automatically rescales every card-count case with it — 5→full
// value, 4→4/5, 3→3/5, matching "reduce by ~10ms per card fewer" at the
// 50ms default (50/5 = 10ms/card) without hardcoding that 10ms anywhere.
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
