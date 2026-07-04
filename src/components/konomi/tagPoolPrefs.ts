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
// Combined rendered height of everything in MixerBar's edit mode that is
// NOT the pool panel — resize handle, title row, slots row, controls row,
// plus the bar's own vertical padding and inter-row gaps — measured live
// at the narrowest (mobile, 390px) width, where the controls row wraps to
// 2 lines and this is tallest (341.5px measured; 345 leaves a small
// buffer). Desktop (1400px) measures a shorter 256.5px — using the mobile
// worst case everywhere is intentionally conservative there (a few px of
// pool panel headroom left unused) rather than precise, same tradeoff
// KonomiApp's MIXER_BAR_SPACER already makes. Retune by hand if any of
// those rows' own height changes. This is what makes the pool panel's max
// height *exact* rather than a rough fraction: title/slots/controls must
// never scroll or be pushed off-screen, so the pool panel is only ever
// allowed to grow up to whatever's left after those fixed rows are
// guaranteed their own space — see clampPoolPanelHeight below.
export const EDIT_MODE_FIXED_ROWS_HEIGHT = 345;

const levelListeners = new Set<() => void>();
const sortListeners = new Set<() => void>();
const poolHeightListeners = new Set<() => void>();

// Shared by both the read-path clamp (getPoolHeightSnapshot) and the live
// drag clamp (MixerBar's resize handler) — one set of bounds, not two that
// could drift apart. The max bound guarantees the *whole* edit-mode bar
// (fixed rows + pool panel) never exceeds the viewport, which is what lets
// MixerBar drop the old outer-scroll safety net entirely: title, slots, and
// controls are unconditionally reachable without ever needing their own
// container to scroll, because the pool panel — the only resizable part —
// is never allowed to make the total taller than the viewport in the first
// place.
export function clampPoolPanelHeight(px: number): number {
  const max = window.innerHeight - EDIT_MODE_FIXED_ROWS_HEIGHT;
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
