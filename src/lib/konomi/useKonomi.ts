import { useMemo, useReducer } from "react";
import { DEFAULT_RESULT_COUNT, SLOT_COUNT } from "./config";
import { scorePool, scoreSeries } from "./scoring";
import type { MatchKey, ResultEntry, Series, Slot, ThemeKey } from "./types";

interface KonomiState {
  series: Series[];
  tags: string[];
  slots: Slot[];
  results: ResultEntry[];
  generated: boolean;
  dragOverIndex: number;
  minMatch: MatchKey;
  flipped: Record<string, boolean>;
  locked: Record<string, boolean>;
  theme: ThemeKey;
}

// Lazy initializer for useReducer — the catalog is only known at the time
// useKonomi() is called (fetched server-side, passed in as props), so the
// initial state can't be a static module-level constant the way it used to
// be when series/tags were hardcoded imports.
function createInitialState(catalog: { series: Series[]; tags: string[] }): KonomiState {
  return {
    series: catalog.series,
    tags: catalog.tags,
    slots: Array<Slot>(SLOT_COUNT).fill(null),
    results: [],
    generated: false,
    dragOverIndex: -1,
    minMatch: "1",
    flipped: {},
    locked: {},
    theme: "default",
  };
}

type Action =
  | { type: "TOGGLE_TAG"; tag: string }
  | { type: "PLACE_IN_SLOT"; index: number; tag: string }
  | { type: "CLEAR_SLOT"; index: number }
  | { type: "SET_DRAG_OVER"; index: number }
  | { type: "CLEAR_DRAG_OVER" }
  | { type: "SET_MIN_MATCH"; key: MatchKey }
  | { type: "RECOMMEND" }
  | { type: "REPLACE_CARD"; index: number }
  | { type: "CLEAR_RECS" }
  | { type: "RANDOM_TAGS" }
  | { type: "CLEAR_SLOTS" }
  | { type: "TOGGLE_LOCK"; title: string }
  | { type: "TOGGLE_FLIP"; title: string }
  | { type: "SET_THEME"; theme: ThemeKey };

function selectedTags(slots: Slot[]): string[] {
  return slots.filter((s): s is string => Boolean(s));
}

// Re-runs the recommend pass against `state` as it stands — used both for
// the RECOMMEND button and after SET_MIN_MATCH, when results are already on
// screen and should reflow against the new filter immediately.
function recommend(state: KonomiState): KonomiState {
  const sel = selectedTags(state.slots);
  if (!sel.length) return state;
  const min = Number(state.minMatch);
  const lockedTitles = new Set(Object.keys(state.locked).filter((k) => state.locked[k]));
  const keptTitles = new Set<string>();
  state.results.forEach((r) => {
    if (lockedTitles.has(r.series.title)) keptTitles.add(r.series.title);
  });
  const pool = scorePool(state.series, sel, min, keptTitles);
  let pi = 0;
  const out: ResultEntry[] = [];
  for (let i = 0; i < DEFAULT_RESULT_COUNT; i++) {
    const old = state.results[i];
    if (old && lockedTitles.has(old.series.title)) {
      out.push({ series: old.series, score: scoreSeries(old.series, sel) });
    } else if (pi < pool.length) {
      out.push(pool[pi]);
      pi++;
    }
  }
  const outTitles = new Set(out.map((r) => r.series.title));
  const flipped: Record<string, boolean> = {};
  Object.keys(state.flipped).forEach((t) => {
    if (outTitles.has(t) && state.flipped[t]) flipped[t] = true;
  });
  return { ...state, results: out, generated: true, flipped };
}

function replaceCard(state: KonomiState, index: number): KonomiState {
  const old = state.results[index];
  if (old && state.locked[old.series.title]) return state;
  const sel = selectedTags(state.slots);
  if (!sel.length) return state;
  const min = Number(state.minMatch);
  const shown = new Set(state.results.map((r) => r.series.title));
  const pool = scorePool(state.series, sel, min, shown);
  if (!pool.length) return state;
  const res = [...state.results];
  res[index] = pool[0];
  const locked = { ...state.locked };
  const flipped = { ...state.flipped };
  if (old) {
    delete locked[old.series.title];
    delete flipped[old.series.title];
  }
  return { ...state, results: res, locked, flipped };
}

function clearRecs(state: KonomiState): KonomiState {
  const lockedTitles = new Set(Object.keys(state.locked).filter((k) => state.locked[k]));
  const kept = state.results.filter((r) => lockedTitles.has(r.series.title));
  if (!kept.length) {
    return { ...state, results: [], generated: false, locked: {}, flipped: {} };
  }
  const locked: Record<string, boolean> = {};
  const flipped: Record<string, boolean> = {};
  kept.forEach((r) => {
    locked[r.series.title] = true;
    if (state.flipped[r.series.title]) flipped[r.series.title] = true;
  });
  return { ...state, results: kept, generated: true, locked, flipped };
}

function randomTags(state: KonomiState): KonomiState {
  const copy: string[] = [...state.tags];
  const picks: string[] = [];
  for (let k = 0; k < SLOT_COUNT && copy.length; k++) {
    const idx = Math.floor(Math.random() * copy.length);
    picks.push(copy.splice(idx, 1)[0]);
  }
  const slots: Slot[] = Array.from({ length: SLOT_COUNT }, (_, i) => picks[i] ?? null);
  return { ...state, slots };
}

function reducer(state: KonomiState, action: Action): KonomiState {
  switch (action.type) {
    case "TOGGLE_TAG": {
      const s = [...state.slots];
      const i = s.indexOf(action.tag);
      if (i >= 0) {
        s[i] = null;
      } else {
        const e = s.indexOf(null);
        if (e < 0) return state;
        s[e] = action.tag;
      }
      return { ...state, slots: s };
    }
    case "PLACE_IN_SLOT": {
      if (!action.tag) return state;
      const s = [...state.slots];
      const ex = s.indexOf(action.tag);
      if (ex >= 0) s[ex] = null;
      s[action.index] = action.tag;
      return { ...state, slots: s, dragOverIndex: -1 };
    }
    case "CLEAR_SLOT": {
      if (!state.slots[action.index]) return state;
      const s = [...state.slots];
      s[action.index] = null;
      return { ...state, slots: s };
    }
    case "SET_DRAG_OVER":
      return state.dragOverIndex === action.index ? state : { ...state, dragOverIndex: action.index };
    case "CLEAR_DRAG_OVER":
      return state.dragOverIndex === -1 ? state : { ...state, dragOverIndex: -1 };
    case "SET_MIN_MATCH": {
      const next = { ...state, minMatch: action.key };
      return next.generated ? recommend(next) : next;
    }
    case "RECOMMEND":
      return recommend(state);
    case "REPLACE_CARD":
      return replaceCard(state, action.index);
    case "CLEAR_RECS":
      return clearRecs(state);
    case "RANDOM_TAGS":
      return randomTags(state);
    case "CLEAR_SLOTS":
      return { ...state, slots: Array<Slot>(SLOT_COUNT).fill(null) };
    case "TOGGLE_LOCK":
      return { ...state, locked: { ...state.locked, [action.title]: !state.locked[action.title] } };
    case "TOGGLE_FLIP":
      return { ...state, flipped: { ...state.flipped, [action.title]: !state.flipped[action.title] } };
    case "SET_THEME":
      return { ...state, theme: action.theme };
    default:
      return state;
  }
}

// Owns all interactive state for the app. Deliberately framework-light and
// DOM-free (no drag events, no document access) so the same hook can back a
// React Native client later — the web layer wires HTML5 drag/drop into
// these plain actions (see TagChip/TagSlot). The catalog (series + tags) is
// fetched once server-side and passed in here rather than imported from a
// static module — everything downstream (scoring, the reducer) stays
// synchronous and unchanged either way.
export function useKonomi(initialSeries: Series[], initialTags: string[]) {
  const [state, dispatch] = useReducer(reducer, { series: initialSeries, tags: initialTags }, createInitialState);

  const sel = useMemo(() => selectedTags(state.slots), [state.slots]);
  const filledCount = sel.length;
  const minNum = Number(state.minMatch);

  const shownTitles = useMemo(() => new Set(state.results.map((r) => r.series.title)), [state.results]);

  const canSwap = useMemo(() => {
    if (filledCount === 0) return false;
    return state.series.some((s) => !shownTitles.has(s.title) && scoreSeries(s, sel) >= minNum);
  }, [filledCount, shownTitles, sel, minNum, state.series]);

  const lockedCount = useMemo(
    () => state.results.filter((r) => state.locked[r.series.title]).length,
    [state.results, state.locked],
  );

  const resultsHint = useMemo(() => {
    if (!state.generated) return "metadata appears here";
    if (state.results.length) {
      return `${state.results.length} recs · ${filledCount} tag${filledCount !== 1 ? "s" : ""} · ${minNum} tag${minNum !== 1 ? "s" : ""} min · ${lockedCount} locked · drag a tag down to remix`;
    }
    return "no matches — loosen the filter";
  }, [state.generated, state.results.length, filledCount, minNum, lockedCount]);

  const actions = useMemo(
    () => ({
      toggleTag: (tag: string) => dispatch({ type: "TOGGLE_TAG", tag }),
      placeInSlot: (index: number, tag: string) => dispatch({ type: "PLACE_IN_SLOT", index, tag }),
      clearSlot: (index: number) => dispatch({ type: "CLEAR_SLOT", index }),
      setDragOver: (index: number) => dispatch({ type: "SET_DRAG_OVER", index }),
      clearDragOver: () => dispatch({ type: "CLEAR_DRAG_OVER" }),
      setMinMatch: (key: MatchKey) => dispatch({ type: "SET_MIN_MATCH", key }),
      recommend: () => dispatch({ type: "RECOMMEND" }),
      replaceCard: (index: number) => dispatch({ type: "REPLACE_CARD", index }),
      clearRecs: () => dispatch({ type: "CLEAR_RECS" }),
      randomTags: () => dispatch({ type: "RANDOM_TAGS" }),
      clearSlots: () => dispatch({ type: "CLEAR_SLOTS" }),
      toggleLock: (title: string) => dispatch({ type: "TOGGLE_LOCK", title }),
      toggleFlip: (title: string) => dispatch({ type: "TOGGLE_FLIP", title }),
      setTheme: (theme: ThemeKey) => dispatch({ type: "SET_THEME", theme }),
    }),
    [],
  );

  return {
    slots: state.slots,
    results: state.results,
    dragOverIndex: state.dragOverIndex,
    minMatch: state.minMatch,
    flipped: state.flipped,
    locked: state.locked,
    theme: state.theme,
    allTags: state.tags,
    selectedTags: sel,
    filledCount,
    minNum,
    canSwap,
    resultsHint,
    lockedLabel: `${filledCount} / ${SLOT_COUNT}`,
    empty: !state.generated,
    hasResults: state.generated && state.results.length > 0,
    noMatch: state.generated && state.results.length === 0,
    ...actions,
  };
}

export type KonomiHook = ReturnType<typeof useKonomi>;
