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
// This whole module (and AnimationDebugPanel.tsx, and every
// getAnimationDebugValues()/useAnimationDebugValues() call site threaded
// through MixerBar.tsx/RollingLabel.tsx/MatchSelector.tsx/LevelSelector.tsx/
// SortSelect.tsx/ResultCard.tsx) is a temporary tuning aid — remove it,
// and inline whatever values it settles on back into each file's own
// plain constant, once the Motion migration's remaining feel/timing
// questions are resolved. Matches this app's own established precedent:
// "live-tweakable via a CardAnimDebugPanel... that panel and its store
// plumbing were removed once these five values were settled" (see
// cardAnimTuning.ts's own top-of-file comment).

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
}

// Defaults mirror each file's own already-tuned, pre-debug-panel constant
// exactly — opening this panel and touching nothing must reproduce
// today's real, shipped behavior.
export const ANIMATION_DEBUG_DEFAULTS: AnimationDebugValues = {
  editPanelTransitionMs: 280,
  editPanelEase: "easeInOut",
  rollDurationMs: 220,
  rollEase: "easeOut",
  cardDurationMs: 300,
  cardStaggerMs: 50,
  cardDistancePx: 8,
  // cubic-bezier(0,0,.2,1) — closest named Motion easing is easeOut; see
  // AnimationDebugPanel.tsx's own comment on why named eases, not a raw
  // bezier editor, for this first pass.
  cardEaseIn: "easeOut",
  cardEaseOut: "easeOut",
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
