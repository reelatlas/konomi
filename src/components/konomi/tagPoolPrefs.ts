"use client";

import { useSyncExternalStore } from "react";
import type { LevelKey, SortKey } from "@/lib/konomi/types";

// Global (not per-section) tag pool preferences — level and sort — shared by
// the pool and every result card. Same useSyncExternalStore + localStorage
// pattern as CollapsibleSection's per-section expand state: reads/writes
// happen outside any render or effect body, so there's no hydration
// mismatch and no setState-during-effect render cascade. Level's setter
// lives in KonomiApp (see setLevelPref there is called alongside the
// mixer's prune cascade) — sort has no cascade, so its setter is called
// directly from the control that changes it.
const LEVEL_STORAGE_KEY = "konomi:tagpool:level";
const SORT_STORAGE_KEY = "konomi:tagpool:sort";
const DEFAULT_LEVEL: LevelKey = "1";
const DEFAULT_SORT: SortKey = "popular";

const levelListeners = new Set<() => void>();
const sortListeners = new Set<() => void>();

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

export function setLevelPref(level: LevelKey) {
  window.localStorage.setItem(LEVEL_STORAGE_KEY, level);
  levelListeners.forEach((callback) => callback());
}

export function setSortPref(sort: SortKey) {
  window.localStorage.setItem(SORT_STORAGE_KEY, sort);
  sortListeners.forEach((callback) => callback());
}
