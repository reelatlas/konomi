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
// MixerBar's edit-mode pool panel height, stored as a FRACTION of the current
// resize ceiling (poolPanelMaxHeight), NOT an absolute pixel height. Storing the
// proportion is what makes the panel track the window: at 70% it stays 70% of
// whatever the ceiling is as the browser resizes, at 100% it stays glued to the
// ceiling, etc. — instead of being pinned to the pixel height it happened to have
// when set (which stopped reading as the same size the moment the viewport
// changed). MixerBar multiplies this back out by the live ceiling (and clamps to
// [POOL_HEIGHT_MIN, ceiling]). null = never set, use the default (POOL_HEIGHT_MIN).
// New key (not the old absolute-px one) so pre-fraction values are simply ignored
// and fall back to the default rather than being misread as a fraction.
const POOL_HEIGHT_FRACTION_KEY = "konomi:tagpool:poolPanelHeightFraction";
const DEFAULT_LEVEL: LevelKey = "1";
const DEFAULT_SORT: SortKey = "popular";
export const POOL_HEIGHT_MIN = 160;
// Combined rendered height of everything in MixerBar's edit mode that is
// NOT the pool panel — resize handle, title/badge row (plus the Tag
// Density/Sort filters, edit-mode-only and right-aligned on that same
// row), slots row, controls row, the card's own border + vertical
// padding, the outer wrapper's bottom gutter (see MixerBar.tsx's
// pb-[var(--space-2xl)]), and inter-row gaps — measured live at the
// narrowest (mobile, 390px) width, where the controls row wraps to 3
// lines (Recommend on its own line, below Random/Clear) and this is
// tallest (472.5px measured; 476 leaves a small buffer). Desktop (1400px)
// measures a shorter 265px — using the mobile worst case everywhere is
// intentionally conservative there (a few px of pool panel headroom left
// unused) rather than precise, same tradeoff KonomiApp's MIXER_BAR_SPACER
// already makes.
//
// The Tag Density/Sort filters briefly lived always-visible in the title
// row (both modes) rather than edit-mode-only — during that pass this
// constant needed a much bigger jump (to 492) since the title row was then
// taller in *every* mode, not just edit mode; confirmed live at the time
// that leaving it at the old value produced a real, silent overflow (the
// bar's top edge landing at a negative screen position, -12.9px, pushing
// the resize handle off the top of the viewport). Filters moved back to
// edit-mode-only since, so this constant only has to account for their
// height in the one mode that still renders them — which is exactly what
// EDIT_MODE_FIXED_ROWS_HEIGHT already means. Retune by hand again if any
// of those rows' own height, the card's padding/border, or the wrapper's
// bottom gutter changes. This is what makes the pool panel's max height
// *exact* rather than a rough fraction: title/slots/controls must never
// scroll or be pushed off-screen, so the pool panel is only ever allowed
// to grow up to whatever's left after those fixed rows are guaranteed
// their own space — see clampPoolPanelHeight below.
export const EDIT_MODE_FIXED_ROWS_HEIGHT = 476;
// How much daylight must always stay visible above the sheet, even at max
// resize — expressed as a fraction of viewport height (not a flat px
// value) so it scales sensibly across breakpoints. 0.10 = 10% of the
// current viewport stays uncovered; the rest is fair game, including
// overlapping the masthead underneath — that overlap is intentional, not
// a bug, once the user has deliberately dragged this far.
export const EDIT_MODE_TOP_BUFFER_RATIO = 0.1;

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
// useSyncExternalStore-backed hook closes this properly — POOL_HEIGHT_MIN
// is a plain constant (identical on server and client with no mechanism
// needed), but this ceiling is viewport-dependent, so it needs the same
// "hold the client back to the server's answer until after hydration"
// guarantee POOL_HEIGHT_MIN gets for free.
export function clampPoolPanelHeight(px: number, max: number): number {
  return Math.min(Math.max(px, POOL_HEIGHT_MIN), max);
}

// `fixedOverheadPx` is MixerBar's own live-measured height of everything
// in the edit sheet that ISN'T the pool panel (resize handle, title/slots/
// controls rows, card border+padding, the wrapper's bottom gutter) at the
// *current* breakpoint — see MixerBar.tsx's ResizeObserver comment. Passing
// it in (rather than hardcoding EDIT_MODE_FIXED_ROWS_HEIGHT here) is what
// lets the ceiling reflect each breakpoint's real row heights instead of
// permanently reserving mobile's tallest (3-line-wrap) case everywhere —
// on desktop's much shorter rows that static constant left ~200px of dead
// space the sheet could never grow into, well short of the viewport top.
// EDIT_MODE_FIXED_ROWS_HEIGHT still matters as MixerBar's *bootstrap*
// value for the one frame before its first real measurement lands.
function getPoolPanelMaxHeightSnapshot(fixedOverheadPx: number): number {
  return window.innerHeight - fixedOverheadPx - window.innerHeight * EDIT_MODE_TOP_BUFFER_RATIO;
}

// The viewport-dependent ceiling clampPoolPanelHeight bounds against —
// split out into its own hook (rather than read directly inside
// clampPoolPanelHeight) specifically so the client's first render can be
// held back to a value matching the server's. getServerSnapshot returns
// Infinity (no ceiling) rather than trying to guess a real one — safe
// because the only value ever clamped against it before hydration
// completes is POOL_HEIGHT_MIN itself, a plain constant already identical
// on server and client, which trivially satisfies "no ceiling" either way.
//
// subscribe listens for `resize`, not a no-op — confirmed live as a real
// bug without it: MixerBar's own effectiveHeightPx is `clampPoolPanelHeight
// (..., poolPanelMaxHeight)`, recomputed fresh on every render, so the fix
// only needed this hook to actually *trigger* a re-render when the ceiling
// changes. A no-op subscribe meant React only ever re-ran getSnapshot when
// some unrelated state change happened to re-render MixerBar anyway — a
// pure vertical-only window resize (bar/dialog's own ResizeObserver, in
// MixerBar, has nothing to fire on, since their DOM content didn't change)
// left the panel's rendered height frozen at whatever it last measured,
// pushing its top edge above the viewport once the window got short enough.
// Note this only ever changes the *effective*, re-derived height — nothing
// here writes to localStorage, so the user's actual stored preference
// (getPoolHeightSnapshot) is untouched and the panel springs back to its
// full stored height as soon as the window grows again.
export function usePoolPanelMaxHeight(fixedOverheadPx: number): number {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener("resize", callback);
      return () => window.removeEventListener("resize", callback);
    },
    () => getPoolPanelMaxHeightSnapshot(fixedOverheadPx),
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
// caller falls back to POOL_HEIGHT_MIN in that case, not a numeric 0.
// Reads window.innerHeight directly here (rather than through
// usePoolPanelMaxHeight) because this function is only ever invoked as
// useSyncExternalStore's getSnapshot argument — React guarantees that
// never runs during SSR or the client's hydration-matching first render,
// only afterward, so there's no "must match the server" constraint on
// this specific read the way there is on clampPoolPanelHeight's own
// direct callers.
//
// The ceiling here is deliberately a loose sanity bound (just the top
// buffer, ignoring fixed-rows overhead entirely) rather than MixerBar's
// precise, live-measured one — this function has no access to that
// per-breakpoint overhead, only `window`. Using the tighter
// EDIT_MODE_FIXED_ROWS_HEIGHT-based ceiling here was tried first and
// created a real, confirmed-live bug: a value freshly dragged to
// MixerBar's own (correctly higher) ceiling would round-trip through
// localStorage, get re-clamped back down to this stricter one on the very
// next read, and visibly snap the sheet down the instant the user
// released the drag. Since this ceiling can only ever be looser than (or
// equal to) MixerBar's own — overhead is never negative, so
// innerHeight - overhead - buffer <= innerHeight - buffer — MixerBar's
// later clampPoolPanelHeight call is always the one actually binding, and
// this one only ever catches genuinely absurd stored values (e.g. dragged
// tall on a large monitor, then opened on a much shorter one).
// Returns the stored height FRACTION (0..1] of the ceiling, or null if never set
// / invalid. Pure of any live measurement now (no window read at all) — the
// fraction is viewport-independent by construction, so unlike the old absolute-px
// snapshot it needs no innerHeight clamp here; MixerBar multiplies it by the live
// ceiling and clamps there. Values outside (0, 1] (e.g. a stale absolute px under
// a different key, or a corrupt entry) are rejected -> null -> default.
function getPoolHeightFractionSnapshot(): number | null {
  const stored = window.localStorage.getItem(POOL_HEIGHT_FRACTION_KEY);
  if (stored === null) return null;
  const parsed = Number(stored);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) return null;
  return parsed;
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
export function usePoolPanelHeightFraction(): number | null {
  return useSyncExternalStore(
    (callback) => {
      poolHeightListeners.add(callback);
      return () => poolHeightListeners.delete(callback);
    },
    getPoolHeightFractionSnapshot,
    () => null,
  );
}

// MixerBar's own seed for a first-ever open (before the user has ever
// dragged, i.e. usePoolPanelHeightFraction() above is still null) is just
// POOL_HEIGHT_MIN itself — opens at the same minimum height a user could
// drag down to, so the sheet reads as "already at its floor, expand if you
// want more" rather than guessing a taller default. A plain constant, not
// a hook: unlike the old 50%-of-viewport seed this replaced, POOL_HEIGHT_MIN
// doesn't depend on `window` at all, so it's already identical on server
// and client with no useSyncExternalStore ceremony needed.

export function setLevelPref(level: LevelKey) {
  window.localStorage.setItem(LEVEL_STORAGE_KEY, level);
  levelListeners.forEach((callback) => callback());
}

export function setSortPref(sort: SortKey) {
  window.localStorage.setItem(SORT_STORAGE_KEY, sort);
  sortListeners.forEach((callback) => callback());
}

// Stores the pool height as a fraction (0..1] of the current ceiling. Callers
// pass height/ceiling (see MixerBar's persist sites); clamped to (0, 1] here so a
// tiny rounding overshoot at max still reads back as a valid fraction.
export function setPoolPanelHeightFraction(fraction: number) {
  const clamped = Math.min(1, Math.max(0.0001, fraction));
  window.localStorage.setItem(POOL_HEIGHT_FRACTION_KEY, String(clamped));
  poolHeightListeners.forEach((callback) => callback());
}
