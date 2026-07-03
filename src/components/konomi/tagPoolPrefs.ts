"use client";

import { useSyncExternalStore } from "react";
import type { LevelKey, SortKey } from "@/lib/konomi/types";

// Global (not per-section) tag pool preferences — level, sort, and the
// desktop-only pool panel resize height — shared across the pool, every
// result card, and MixerBar. Same useSyncExternalStore + localStorage
// pattern as CollapsibleSection's per-section expand state: reads/writes
// happen outside any render or effect body, so there's no hydration
// mismatch and no setState-during-effect render cascade. Level's setter
// lives in KonomiApp (see setLevelPref there is called alongside the
// mixer's prune cascade) — sort and pool-panel-height have no cascade, so
// their setters are called directly from the control that changes them.
const LEVEL_STORAGE_KEY = "konomi:tagpool:level";
const SORT_STORAGE_KEY = "konomi:tagpool:sort";
// MixerBar's edit-mode pool panel height, desktop-drag-resizable only —
// see MixerBar.tsx's resize handle. Unlike level/sort (an enum, always
// valid), this is the app's first persisted raw pixel value, so it needs
// bounds-checking on every read, not just a type guard — a value dragged
// tall on a large desktop monitor must not break a later, narrower/shorter
// session (see clampPoolPanelHeight below). null means "never dragged, use
// the CSS 50dvh default" — the stored key only exists once the user drags
// at least once.
const POOL_HEIGHT_STORAGE_KEY = "konomi:tagpool:poolPanelHeight";
const DEFAULT_LEVEL: LevelKey = "1";
const DEFAULT_SORT: SortKey = "popular";
export const POOL_HEIGHT_MIN = 160;
// Fraction, not a fixed px ceiling — deliberately viewport-relative so the
// clamp itself scales down correctly on a later, shorter session instead of
// needing its own separate re-derivation. Live in-session window resizes
// aren't specially re-clamped (useSyncExternalStore only re-checks its
// snapshot on notify/re-render, not on a resize event) — MixerBar's outer
// max-h-[100dvh] overflow-y-auto safety net already covers that case, so
// this isn't a gap in practice, just a scope boundary worth being explicit
// about.
export const POOL_HEIGHT_MAX_FRACTION = 0.75;

const levelListeners = new Set<() => void>();
const sortListeners = new Set<() => void>();
const poolHeightListeners = new Set<() => void>();

// Shared by both the read-path clamp (getPoolHeightSnapshot) and the live
// drag clamp (MixerBar's resize handler) — one set of bounds, not two that
// could drift apart.
export function clampPoolPanelHeight(px: number): number {
  const max = window.innerHeight * POOL_HEIGHT_MAX_FRACTION;
  return Math.min(Math.max(px, POOL_HEIGHT_MIN), max);
}

function isLevelKey(value: string | null): value is LevelKey {
  return value === "1" || value === "2" || value === "3";
}

function isSortKey(value: string | null): value is SortKey {
  return value === "popular" || value === "unpopular" || value === "az" || value === "za";
}

function getLevelSnapshot(): LevelKey {
  const stored = window.localStorage.getItem(LEVEL_STORAGE_KEY);
  return isLevelKey(stored) ? stored : DEFAULT_LEVEL;
}

function getSortSnapshot(): SortKey {
  const stored = window.localStorage.getItem(SORT_STORAGE_KEY);
  return isSortKey(stored) ? stored : DEFAULT_SORT;
}

// null = never dragged (no stored key, or a corrupt/non-numeric one) — the
// caller falls back to the CSS 50dvh default in that case, not a numeric 0.
function getPoolHeightSnapshot(): number | null {
  const stored = window.localStorage.getItem(POOL_HEIGHT_STORAGE_KEY);
  if (stored === null) return null;
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed > 0 ? clampPoolPanelHeight(parsed) : null;
}

export function useLevel(): LevelKey {
  return useSyncExternalStore(
    (callback) => {
      levelListeners.add(callback);
      return () => levelListeners.delete(callback);
    },
    getLevelSnapshot,
    () => DEFAULT_LEVEL,
  );
}

export function useSort(): SortKey {
  return useSyncExternalStore(
    (callback) => {
      sortListeners.add(callback);
      return () => sortListeners.delete(callback);
    },
    getSortSnapshot,
    () => DEFAULT_SORT,
  );
}

// SSR/first-paint fallback is null (not clampPoolPanelHeight(0) or similar)
// — window isn't available server-side to clamp against anyway, and null
// already means exactly "use the CSS default," which is the correct
// pre-hydration state regardless of what's in localStorage.
export function usePoolPanelHeight(): number | null {
  return useSyncExternalStore(
    (callback) => {
      poolHeightListeners.add(callback);
      return () => poolHeightListeners.delete(callback);
    },
    getPoolHeightSnapshot,
    () => null,
  );
}

export function setLevelPref(level: LevelKey) {
  window.localStorage.setItem(LEVEL_STORAGE_KEY, level);
  levelListeners.forEach((callback) => callback());
}

export function setSortPref(sort: SortKey) {
  window.localStorage.setItem(SORT_STORAGE_KEY, sort);
  sortListeners.forEach((callback) => callback());
}

export function setPoolPanelHeightPref(height: number) {
  window.localStorage.setItem(POOL_HEIGHT_STORAGE_KEY, String(Math.round(height)));
  poolHeightListeners.forEach((callback) => callback());
}
