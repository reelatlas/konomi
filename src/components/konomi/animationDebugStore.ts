"use client";

import { useSyncExternalStore } from "react";

// A single, shared, live-tweakable source of truth for every animation
// constant across the app's Motion migration (motion/react) — built
// directly in response to a real debugging need: with MixerBar's edit
// panel, RollingLabel's roll, and the result-card enter/exit all now
// driven by Motion, isolating "which specific value is causing what" by
// editing source and reloading was slow going. AnimationDebugPanel.tsx
// (this file's own UI) reads/writes this store; every animated component
// reads its own values from it instead of a hardcoded constant.
//
// Same useSyncExternalStore-backed pattern already established elsewhere
// in this app (tagPoolPrefs.ts's usePoolPanelHeight, RecommendationsBody.tsx's
// empty-state shuffle-bag) — a plain module-level mutable value plus a
// listener set, not React state, since this needs to be readable from
// plain event handlers (e.g. rollBusyRef's own setTimeout scheduling in
// MatchSelector/LevelSelector/SortSelect) as well as reactively from
// component render bodies.
//
// Deliberately NOT persisted to localStorage — this resets to the tuned
// defaults on every reload, the same "in-memory only" scoping the old,
// since-removed CardAnimDebugPanel used (see cardAnimTuning.ts's own
// comment) — a stray debug value should never accidentally look like
// production behavior after this session ends.
//
// STATUS (2026-07-24): the timing rework is SETTLED — every default below
// is a user-ruled final value (see DESIGN_SYSTEM.md "Timing rework
// (2026-07-24)"), and AnimationDebugPanel is UNMOUNTED from KonomiApp
// (file kept; re-mount it there to retune live). The store itself stays as
// the single live source the animated components read — deliberately NOT
// inlined-and-deleted this round: consumers across MixerBar/RollingLabel/
// MatchSelector/LevelSelector/SortSelect/ResultCard/RecommendationsBody
// already read it, the never-changing values cost nothing at runtime, and
// keeping it makes the next retune a one-line panel re-mount instead of
// re-threading nine files. The named constants in cardAnimTuning.ts /
// RollingLabel.tsx are kept mirrored to these defaults — update both
// together.

export type NamedEase =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "circIn"
  | "circOut"
  | "circInOut"
  | "backIn"
  | "backOut"
  | "backInOut";

export const NAMED_EASES: NamedEase[] = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "circIn",
  "circOut",
  "circInOut",
  "backIn",
  "backOut",
  "backInOut",
];

// One bezier per name, usable by BOTH consumers: Motion transitions take the
// tuple directly, CSS keyframes take namedEaseToCss()'s string. Needed
// because the card enter/exit are CSS keyframes — a Motion ease NAME means
// nothing to them (the dropdowns were dead until this map existed, verified
// live via getComputedStyle: timing stayed hardcoded while the select
// changed). "easeOut" is deliberately THIS APP'S shipped deceleration curve
// cubic-bezier(0,0,.2,1), NOT Motion's stock easeOut (0,0,0.58,1) — the
// store's defaults-reproduce-shipped contract wins over Motion fidelity
// (same compromise the cardEaseIn/Out default naming already made).
export const NAMED_EASE_BEZIER: Record<NamedEase, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.2, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  circIn: [0.55, 0, 1, 0.45],
  circOut: [0, 0.55, 0.45, 1],
  circInOut: [0.85, 0, 0.15, 1],
  backIn: [0.36, 0, 0.66, -0.56],
  backOut: [0.34, 1.56, 0.64, 1],
  backInOut: [0.68, -0.6, 0.32, 1.6],
};

export function namedEaseToCss(ease: NamedEase): string {
  return `cubic-bezier(${NAMED_EASE_BEZIER[ease].join(", ")})`;
}

export interface AnimationDebugValues {
  // MixerBar's edit panel (growableRef's own `layout` transition) — see
  // that file's own EDIT_PANEL_TRANSITION_MS/layoutTransition.
  editPanelTransitionMs: number;
  editPanelEase: NamedEase;
  // RollingLabel's slot-machine roll (MatchSelector/LevelSelector/
  // SortSelect's collapsed forms) — see that file's own ROLL_DURATION_MS/
  // ROLL_TRANSITION.
  rollDurationMs: number;
  rollEase: NamedEase;
  // Result-card enter/exit + stagger — see cardAnimTuning.ts's own
  // CARD_ANIM_*.
  cardDurationMs: number;
  cardStaggerMs: number;
  cardDistancePx: number;
  cardEaseIn: NamedEase;
  cardEaseOut: NamedEase;
  // The pace rule as a DIRECT step: how many ms the effective stagger
  // shrinks per card fewer than 5 sweeping (see getSteppedStaggerMs,
  // cardAnimTuning.ts). 10 = the shipped ratio's exact numbers at the 50ms
  // base (50/40/30/20/10 across 5..1 cards); 0 = no progressive scale at
  // all (flat stagger at every width/lock count); bigger = more aggressive
  // tightening, clamped at 0. Replaces the ratio's implicit base/5 coupling
  // with a knob tunable on its own — added for the 2026-07 timing rework.
  staggerStepMs: number;
  // Result-card FLIP slide (locks/repeats compacting on RECOMMEND/Clear ✕,
  // ResultCard's layout="position" transition) — previously hard-coupled to
  // cardDurationMs + a fixed bezier; split out for the 2026-07 timing rework
  // so the slide is tunable on its own.
  slideDurationMs: number;
  slideEase: NamedEase;
  // The SAME compaction slide, but for the post-Clear-✕ case specifically:
  // Clear's choreography is deliberately sequential (exit sweep finishes,
  // THEN the locked survivors compact — see RecommendationsBody's settle
  // timer), so that slide plays in isolation after a wait and reads slower
  // than the identical duration does mid-RECOMMEND (where it overlaps the
  // enter sweep). Split out so the post-Clear slide can be tuned faster
  // without touching the RECOMMEND-time slide.
  clearSlideDurationMs: number;
  // Empty-state box, per DIRECTION — split twice during the 2026-07-24
  // rework: first from the card values it used to borrow (at the cards'
  // 12px travel the box's top border was effectively already in place on
  // Clear, killing the "pushes up from behind the cards" read), then into
  // independent enter/exit sets (user-ruled: the Clear-✕ entrance and the
  // recommend-time exit are different moments and shouldn't share values).
  // ENTER = after Clear ✕: the box rises IN, STARTING `distance` px from
  // its resting spot (+ = below rising up, − = above dropping down),
  // `delay` ms after the clear (0 = concurrent with the card exit sweep).
  // EXIT = on RECOMMEND from the empty state: the box moves out from rest,
  // ENDING `distance` px away (+ = up, − = down) as the incoming cards
  // knock it away. The distance sliders are the Y-offset controls — there
  // is no separate start-position knob, the offset IS the start (enter) /
  // end (exit) position. These get named constants at final bake.
  emptyEnterDurationMs: number;
  emptyEnterDistancePx: number;
  emptyEnterDelayMs: number;
  emptyEnterEase: NamedEase;
  emptyExitDurationMs: number;
  emptyExitDistancePx: number;
  emptyExitDelayMs: number;
  emptyExitEase: NamedEase;
}

// Defaults = the settled values from the 2026-07-24 timing rework (tuned
// live in this panel, ruled by the user), superseding the original
// pre-panel constants. The contract is unchanged: opening this panel and
// touching nothing must reproduce the app's real, current behavior — these
// ARE that behavior now, mirrored into each file's own constant
// (cardAnimTuning.ts CARD_ANIM_*/CARD_SLIDE_*, RollingLabel.tsx
// ROLL_DURATION_MS).
export const ANIMATION_DEBUG_DEFAULTS: AnimationDebugValues = {
  editPanelTransitionMs: 180,
  editPanelEase: "easeInOut",
  rollDurationMs: 120,
  rollEase: "easeOut",
  cardDurationMs: 600,
  cardStaggerMs: 60,
  cardDistancePx: 12,
  // "easeOut" here is the app's shipped deceleration curve
  // cubic-bezier(0,0,.2,1) — see NAMED_EASE_BEZIER above.
  cardEaseIn: "easeOut",
  cardEaseOut: "easeOut",
  // 0 — user-ruled: the progressive "tighten as cards get fewer" rule is
  // RETIRED; the stagger is flat at every width/lock count. The stepped
  // machinery stays (getSteppedStaggerMs) purely as the seam to bring it
  // back by raising this number.
  staggerStepMs: 0,
  slideDurationMs: 700,
  slideEase: "easeOut",
  // Faster than the recommend-time slide on purpose (see the field's own
  // comment above): the post-Clear compaction plays in isolation after the
  // exit sweep, where the same duration reads much slower.
  clearSlideDurationMs: 380,
  // Settled 2026-07-24 (user-ruled): the entrance starts 20px below, waits
  // 120ms so the departing cards visibly begin leaving first, then rises in
  // over 440ms; the exit is a quick light 240ms/12px lift with no delay —
  // the incoming cards knock it away immediately.
  emptyEnterDurationMs: 440,
  emptyEnterDistancePx: 20,
  emptyEnterDelayMs: 120,
  emptyEnterEase: "easeOut",
  emptyExitDurationMs: 240,
  emptyExitDistancePx: 12,
  emptyExitDelayMs: 0,
  emptyExitEase: "easeOut",
};

let values: AnimationDebugValues = { ...ANIMATION_DEBUG_DEFAULTS };
const listeners = new Set<() => void>();

// Non-reactive read — for plain event handlers/closures that need
// "whatever the value is right now" without subscribing to changes (e.g.
// a rollBusyRef setTimeout, scheduled once per click, matching however
// long a roll started at that instant was actually configured to run).
export function getAnimationDebugValues(): AnimationDebugValues {
  return values;
}

export function setAnimationDebugValue<K extends keyof AnimationDebugValues>(key: K, value: AnimationDebugValues[K]): void {
  values = { ...values, [key]: value };
  listeners.forEach((listener) => listener());
}

export function resetAnimationDebugValues(): void {
  values = { ...ANIMATION_DEBUG_DEFAULTS };
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// getServerSnapshot returns the same defaults every time — this store's
// own values only ever change via direct user interaction with the debug
// panel itself, which can't happen before hydration, so there's no
// hydration-mismatch risk the way tagPoolPrefs.ts's own persisted
// (localStorage-backed) values have to guard against.
export function useAnimationDebugValues(): AnimationDebugValues {
  return useSyncExternalStore(subscribe, getAnimationDebugValues, () => ANIMATION_DEBUG_DEFAULTS);
}
