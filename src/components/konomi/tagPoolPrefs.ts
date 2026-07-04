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
// the card's own border + vertical padding, the outer wrapper's bottom
// gutter (see MixerBar.tsx's pb-[var(--space-2xl)]), and inter-row gaps —
// measured live at the narrowest (mobile, 390px) width, where the controls
// row wraps to 3 lines (Recommend on its own line, below Random/Clear —
// see MixerBar.tsx's card-padding comment) and this is tallest (387.5px
// measured; 390 leaves a small buffer). Desktop (1400px) measures a
// shorter 282.5px — using the mobile worst case everywhere is
// intentionally conservative there (a few px of pool panel headroom left
// unused) rather than precise, same tradeoff KonomiApp's MIXER_BAR_SPACER
// already makes. Retune by hand if any of those rows' own height, the
// card's padding/border, or the wrapper's bottom gutter changes. This is
// what makes the pool panel's max height *exact* rather than a rough
// fraction: title/slots/controls must never scroll or be pushed
// off-screen, so the pool panel is only ever allowed to grow up to
// whatever's left after those fixed rows are guaranteed their own space —
// see clampPoolPanelHeight below.
export const EDIT_MODE_FIXED_ROWS_HEIGHT = 390;

const levelListeners = new Set<() => void>();
const sortListeners = new Set<() => void>();
const poolHeightListeners = new Set<() => void>();

// Pure — no window access at all. `max` is supplied by the caller (see
// usePoolPanelMaxHeight below) rather than computed in here directly.
// An earlier version read `window.innerHeight` inline, guarded only by
// `typeof window === "undefined"` — that guard stops the SSR *crash*
// (this is called directly in MixerBar's render body, not only through
// usePoolPanelHeight's useSyncExternalStore, which already skips
// getPoolHeightSnapshot server-side via its own getServerSnapshot), but
// crash-safe and hydration-safe are not the same guarantee. `window` is a
// plain global, immediately real on the client's very first render —
// unlike a useSyncExternalStore snapshot, which React deliberately holds
// back until *after* hydration completes. So the server always took the
// fallback branch (floor only, no ceiling) while the client's first
// render immediately took the real branch (a real, viewport-dependent
// ceiling) — two different answers for the same input whenever that
// ceiling would actually pull the value down, i.e. on a short viewport.
// (At the constants in place when this was found, `CHIP_AREA_MIN`'s own
// floor happened to absorb the entire gap before it reached anything
// actually rendered — confirmed live at a 400px-tall viewport, no visible
// mismatch — but that was incidental to those specific numbers, not a
// real guarantee; changing any of POOL_HEIGHT_MIN/FILTERS_AND_TABS_HEIGHT/
// CHIP_AREA_MIN/EDIT_MODE_FIXED_ROWS_HEIGHT could have silently reopened a
// visible one.) Moving the ceiling itself out to its own
// useSyncExternalStore-backed hook closes this properly, the same way
// useDefaultPoolPanelHeight already does for the default height value —
// see that hook for why "guard against crashing" and "guard against a
// hydration mismatch" require different mechanisms.
export function clampPoolPanelHeight(px: number, max: number): number {
  return Math.min(Math.max(px, POOL_HEIGHT_MIN), max);
}

function getPoolPanelMaxHeightSnapshot(): number {
  return window.innerHeight - EDIT_MODE_FIXED_ROWS_HEIGHT;
}

// The viewport-dependent ceiling clampPoolPanelHeight bounds against —
// split out into its own hook (rather than read directly inside
// clampPoolPanelHeight) specifically so the client's first render can be
// held back to a value matching the server's, the same mechanism
// useDefaultPoolPanelHeight already relies on. getServerSnapshot returns
// Infinity (no ceiling) rather than trying to guess a real one — safe
// because the only value ever clamped against it before hydration
// completes is POOL_HEIGHT_MIN itself (via useDefaultPoolPanelHeight,
// also held back the same way), and POOL_HEIGHT_MIN trivially satisfies
// "no ceiling" on both server and client.
export function usePoolPanelMaxHeight(): number {
  return useSyncExternalStore(
    () => () => {},
    getPoolPanelMaxHeightSnapshot,
    () => Number.POSITIVE_INFINITY,
  );
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
// Reads window.innerHeight directly here (rather than through
// usePoolPanelMaxHeight) because this function is only ever invoked as
// useSyncExternalStore's getSnapshot argument — React guarantees that
// never runs during SSR or the client's hydration-matching first render,
// only afterward, so there's no "must match the server" constraint on
// this specific read the way there is on clampPoolPanelHeight's own
// direct callers.
function getPoolHeightSnapshot(): number | null {
  const stored = window.localStorage.getItem(POOL_HEIGHT_STORAGE_KEY);
  if (stored === null) return null;
  const parsed = Number(stored);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return clampPoolPanelHeight(parsed, window.innerHeight - EDIT_MODE_FIXED_ROWS_HEIGHT);
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

function getDefaultPoolPanelHeightSnapshot(): number {
  return window.innerHeight * 0.5;
}

// MixerBar's own seed for a first-ever open (before the user has ever
// dragged, i.e. usePoolPanelHeight() above is still null) — "50% of the
// current viewport," read via useSyncExternalStore purely for its
// SSR-safe getServerSnapshot fallback, not because this is backed by a
// real external store: the subscribe function below never calls its
// callback, so React never has a reason to re-read this after the first
// post-hydration render, and it never updates again after that (a plain
// `useState(() => window.innerHeight * 0.5)` lazy initializer was tried
// first and produced a real hydration mismatch — the server has no
// `window` at all, but the client's own *first* render already does, so
// it would compute the real value immediately while the server rendered
// a fallback, and React compares the two; TagPoolBody's chip-area inline
// `style={{height}}` still renders — and still gets compared — even while
// the whole pool panel sits inside a visually-collapsed
// `max-h-0 overflow-hidden` wrapper, so being invisible didn't exempt it).
// `useSyncExternalStore`'s own getServerSnapshot mechanism guarantees the
// client's first render matches the server's, with the real value only
// appearing in a separate, ordinary post-hydration re-render — the
// React-blessed way to do this, as opposed to a `useState`+`useEffect`
// pair that calls setState directly in the effect body (flagged by this
// project's own lint config, `react-hooks/set-state-in-effect`, for good
// reason: that pattern causes an extra cascading render on every mount,
// where this one doesn't).
export function useDefaultPoolPanelHeight(): number {
  return useSyncExternalStore(
    () => () => {},
    getDefaultPoolPanelHeightSnapshot,
    () => POOL_HEIGHT_MIN,
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
