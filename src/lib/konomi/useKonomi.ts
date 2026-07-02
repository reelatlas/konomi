import { useMemo, useReducer } from "react";
import { DEFAULT_RESULT_COUNT, SLOT_COUNT } from "./config";
import { scorePool, scoreSeries } from "./scoring";
import type { MatchKey, MixerError, ResultEntry, Series, Slot, TagInfo, ThemeKey } from "./types";

interface KonomiState {
  series: Series[];
  tags: TagInfo[];
  genres: string[];
  slots: Slot[];
  results: ResultEntry[];
  generated: boolean;
  dragOverIndex: number;
  minMatch: MatchKey;
  flipped: Record<string, boolean>;
  locked: Record<string, boolean>;
  theme: ThemeKey;
  error: MixerError;
}

// Lazy initializer for useReducer — the catalog is only known at the time
// useKonomi() is called (fetched server-side, passed in as props), so the
// initial state can't be a static module-level constant the way it used to
// be when series/tags were hardcoded imports.
function createInitialState(catalog: { series: Series[]; tags: TagInfo[]; genres: string[] }): KonomiState {
  return {
    series: catalog.series,
    tags: catalog.tags,
    genres: catalog.genres,
    slots: Array<Slot>(SLOT_COUNT).fill(null),
    results: [],
    generated: false,
    dragOverIndex: -1,
    minMatch: "1",
    flipped: {},
    locked: {},
    theme: "default",
    error: null,
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
  | { type: "REPLACE_CARD"; title: string }
  | { type: "CLEAR_RECS" }
  | { type: "RANDOM_TAGS"; visible: string[] }
  | { type: "CLEAR_SLOTS" }
  | { type: "TOGGLE_LOCK"; title: string }
  | { type: "TOGGLE_FLIP"; title: string }
  | { type: "SET_THEME"; theme: ThemeKey }
  | { type: "PRUNE_TAGS"; visible: Set<string> };

function selectedTags(slots: Slot[]): string[] {
  return slots.filter((s): s is string => Boolean(s));
}

// The only place `error` is ever SET — every other reducer branch below only
// clears it. Two distinct failure modes, checked in priority order:
// "impossible-min" (tag count can't reach the current min-match, checked
// before even touching the catalog) and "no-match" (min-match is achievable
// but a fresh catalog rescore found nothing new — checked regardless of
// whether locked cards still fill some slots, since the question is "did a
// new search succeed", not "is anything currently visible"). On either
// error, `results` is deliberately left untouched — stale results stay on
// screen, live-filtered elsewhere, until a genuinely new RECOMMEND succeeds
// or the user hits Clear ✕.
function recommend(state: KonomiState): KonomiState {
  const sel = selectedTags(state.slots);
  if (!sel.length) return state;
  const min = Number(state.minMatch);
  if (sel.length < min) {
    return { ...state, generated: true, error: "impossible-min" };
  }
  const lockedTitles = new Set(Object.keys(state.locked).filter((k) => state.locked[k]));
  const keptTitles = new Set<string>();
  state.results.forEach((r) => {
    if (lockedTitles.has(r.series.title)) keptTitles.add(r.series.title);
  });
  const pool = scorePool(state.series, sel, min, keptTitles);
  if (!pool.length) {
    return { ...state, generated: true, error: "no-match" };
  }
  let pi = 0;
  const out: ResultEntry[] = [];
  for (let i = 0; i < DEFAULT_RESULT_COUNT; i++) {
    const old = state.results[i];
    if (old && lockedTitles.has(old.series.title)) {
      // Clamped to `min`, not the raw live score — a locked carry-over must
      // satisfy the CURRENT threshold by construction, the same guarantee
      // `scorePool` already gives every fresh entry (it only ever returns
      // score >= min). Without this, a locked card that doesn't match the
      // new tags could be carried over with a score below min-match — fine
      // while locked (visibleResults exempts locked cards), but the moment
      // it's unlocked, that honestly-low frozen score fails the same
      // min-match check every other entry has to pass, and the card
      // vanishes even though it's a real, positioned member of `results`.
      out.push({ series: old.series, score: Math.max(scoreSeries(old.series, sel), min) });
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
  return { ...state, results: out, generated: true, flipped, error: null };
}

// Shared by every reducer branch that mutates `slots` — clears "no-match"
// unconditionally (any tag change is a fresh attempt) and clears
// "impossible-min" only via the global override (tag count hits zero).
// Adding/swapping tags never clears "impossible-min" on its own — per the
// design, only lowering min-match itself (SET_MIN_MATCH below) does that,
// since min-match is a deliberate setting the app never silently changes.
function clearErrorForTagChange(state: KonomiState, slots: Slot[]): MixerError {
  if (state.error === "no-match") return null;
  if (state.error === "impossible-min" && selectedTags(slots).length === 0) return null;
  return state.error;
}

// Targets by title, not array index — `onReplace` fires from whichever card
// is currently on screen, which is `visibleResults` (filtered by live
// min-match), not `state.results` (unfiltered) that this reducer operates
// on. Those two arrays' indices diverge the moment anything is hidden, so an
// index passed straight through would silently hit the wrong slot. Title is
// the same stable identifier `TOGGLE_LOCK`/`TOGGLE_FLIP` already use for
// exactly this reason.
function replaceCard(state: KonomiState, title: string): KonomiState {
  const index = state.results.findIndex((r) => r.series.title === title);
  if (index < 0) return state;
  const old = state.results[index];
  if (state.locked[old.series.title]) return state;
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
    return { ...state, results: [], generated: false, locked: {}, flipped: {}, error: null };
  }
  const locked: Record<string, boolean> = {};
  const flipped: Record<string, boolean> = {};
  kept.forEach((r) => {
    locked[r.series.title] = true;
    if (state.flipped[r.series.title]) flipped[r.series.title] = true;
  });
  return { ...state, results: kept, generated: true, locked, flipped, error: null };
}

// Generic "clear any slot whose tag isn't in this set" — used when the tag
// pool's level changes and a selected tag falls outside the new visible set.
// Per the spec, that tag must behave exactly like a manual deselect —
// structurally identical to TOGGLE_TAG below: touch slots only, nothing
// else. Cards (if any are showing) stay exactly as they are; scoreSeries is
// recomputed live off selectedTags on every ResultCard render, so a pruned
// tag's highlight/score contribution disappears immediately without a
// recommend()/clearRecs() cascade — results only change when the user hits
// RECOMMEND again. The caller (KonomiApp) computes `visible` from the tag
// pool's level — this reducer doesn't need to know what a "level" is, just
// which names are still allowed.
function pruneTags(state: KonomiState, visible: Set<string>): KonomiState {
  const slots = state.slots.map((s) => (s && !visible.has(s) ? null : s));
  if (!slots.some((s, i) => s !== state.slots[i])) return state;
  return { ...state, slots, error: clearErrorForTagChange(state, slots) };
}

// Picks from the caller-supplied visible-name list, not state.tags directly
// — mirrors pruneTags: this reducer doesn't need to know what makes a tag
// "visible" (level, section mapping, etc.), just the allowed pool to pick
// from. If there aren't enough visible names to fill every slot, the loop
// below already stops early and leaves the rest empty (picks[i] ?? null).
function randomTags(state: KonomiState, visible: string[]): KonomiState {
  const copy = [...visible];
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
      return { ...state, slots: s, error: clearErrorForTagChange(state, s) };
    }
    case "PLACE_IN_SLOT": {
      if (!action.tag) return state;
      const s = [...state.slots];
      const ex = s.indexOf(action.tag);
      if (ex >= 0) s[ex] = null;
      s[action.index] = action.tag;
      return { ...state, slots: s, dragOverIndex: -1, error: clearErrorForTagChange(state, s) };
    }
    case "CLEAR_SLOT": {
      if (!state.slots[action.index]) return state;
      const s = [...state.slots];
      s[action.index] = null;
      return { ...state, slots: s, error: clearErrorForTagChange(state, s) };
    }
    case "SET_DRAG_OVER":
      return state.dragOverIndex === action.index ? state : { ...state, dragOverIndex: action.index };
    case "CLEAR_DRAG_OVER":
      return state.dragOverIndex === -1 ? state : { ...state, dragOverIndex: -1 };
    case "SET_MIN_MATCH": {
      // Deliberately never calls recommend() — a min-match change only ever
      // live-filters what's already on screen (computed in useKonomi below,
      // off the unchanged `results`), never triggers a fresh catalog
      // rescore or an error. It only clears errors that are no longer
      // applicable: "no-match" clears on any min-match change (a fresh
      // value is a fresh attempt), "impossible-min" clears only once
      // lowered to something the current tag count can actually satisfy.
      const tagCount = selectedTags(state.slots).length;
      let error = state.error;
      if (error === "no-match") error = null;
      if (error === "impossible-min" && Number(action.key) <= tagCount) error = null;
      return { ...state, minMatch: action.key, error };
    }
    case "RECOMMEND":
      return recommend(state);
    case "REPLACE_CARD":
      return replaceCard(state, action.title);
    case "CLEAR_RECS":
      return clearRecs(state);
    case "RANDOM_TAGS":
      return randomTags(state, action.visible);
    case "CLEAR_SLOTS": {
      const s = Array<Slot>(SLOT_COUNT).fill(null);
      return { ...state, slots: s, error: clearErrorForTagChange(state, s) };
    }
    case "TOGGLE_LOCK":
      return { ...state, locked: { ...state.locked, [action.title]: !state.locked[action.title] } };
    case "TOGGLE_FLIP":
      return { ...state, flipped: { ...state.flipped, [action.title]: !state.flipped[action.title] } };
    case "SET_THEME":
      return { ...state, theme: action.theme };
    case "PRUNE_TAGS":
      return pruneTags(state, action.visible);
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
export function useKonomi(initialSeries: Series[], initialTags: TagInfo[], initialGenres: string[]) {
  const [state, dispatch] = useReducer(
    reducer,
    { series: initialSeries, tags: initialTags, genres: initialGenres },
    createInitialState,
  );

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

  // Live filter, not a reducer concern — `state.results` itself is never
  // mutated by a tag/min-match change (see clearErrorForTagChange's doc
  // comment above). Deliberately compares each entry's FROZEN `score`
  // (captured once, when RECOMMEND or a swap put it into `state.results`)
  // against the LIVE `minNum` — not a live-recomputed score against the
  // current tag selection. That split is the whole point: min-match changes
  // must hide/show cards (frozen score vs a live threshold), but tag
  // changes must never hide a card, only re-highlight/re-count it (handled
  // separately, live, in ResultCard). Using a live score here would re-hide
  // cards the instant a tag was removed, which is exactly the bug this
  // avoids. `sel` is deliberately NOT a dependency — tag changes structurally
  // cannot affect this filter's result, not just incidentally don't.
  const visibleResults = useMemo(
    () => state.results.filter((r) => state.locked[r.series.title] || r.score >= minNum),
    [state.results, state.locked, minNum],
  );

  // name -> TagInfo lookup so result cards can merge a series' tags and
  // genres into one list, then level-filter and sort it exactly like the
  // pool does (needs isGenre/seriesCount, not just avgRank — see ResultCard).
  const tagInfoByName = useMemo(() => {
    const m = new Map<string, TagInfo>();
    state.tags.forEach((t) => m.set(t.name, t));
    return m;
  }, [state.tags]);

  const resultsHint = useMemo(() => {
    if (!state.generated) return "metadata appears here";
    if (visibleResults.length) {
      return `${visibleResults.length} recs · ${filledCount} tag${filledCount !== 1 ? "s" : ""} · ${minNum} tag${minNum !== 1 ? "s" : ""} min · ${lockedCount} locked · drag a tag down to remix`;
    }
    return "no matches — loosen the filter";
  }, [state.generated, visibleResults.length, filledCount, minNum, lockedCount]);

  const actions = useMemo(
    () => ({
      toggleTag: (tag: string) => dispatch({ type: "TOGGLE_TAG", tag }),
      placeInSlot: (index: number, tag: string) => dispatch({ type: "PLACE_IN_SLOT", index, tag }),
      clearSlot: (index: number) => dispatch({ type: "CLEAR_SLOT", index }),
      setDragOver: (index: number) => dispatch({ type: "SET_DRAG_OVER", index }),
      clearDragOver: () => dispatch({ type: "CLEAR_DRAG_OVER" }),
      setMinMatch: (key: MatchKey) => dispatch({ type: "SET_MIN_MATCH", key }),
      recommend: () => dispatch({ type: "RECOMMEND" }),
      replaceCard: (title: string) => dispatch({ type: "REPLACE_CARD", title }),
      clearRecs: () => dispatch({ type: "CLEAR_RECS" }),
      randomTags: (visible: string[]) => dispatch({ type: "RANDOM_TAGS", visible }),
      clearSlots: () => dispatch({ type: "CLEAR_SLOTS" }),
      toggleLock: (title: string) => dispatch({ type: "TOGGLE_LOCK", title }),
      toggleFlip: (title: string) => dispatch({ type: "TOGGLE_FLIP", title }),
      setTheme: (theme: ThemeKey) => dispatch({ type: "SET_THEME", theme }),
      pruneTags: (visible: Set<string>) => dispatch({ type: "PRUNE_TAGS", visible }),
    }),
    [],
  );

  return {
    slots: state.slots,
    results: state.results,
    visibleResults,
    dragOverIndex: state.dragOverIndex,
    minMatch: state.minMatch,
    flipped: state.flipped,
    locked: state.locked,
    theme: state.theme,
    allTags: state.tags,
    allGenres: state.genres,
    tagInfoByName,
    totalSeriesCount: state.series.length,
    selectedTags: sel,
    filledCount,
    minNum,
    canSwap,
    resultsHint,
    lockedLabel: `${filledCount} / ${SLOT_COUNT}`,
    empty: !state.generated,
    hasResults: state.generated && state.results.length > 0,
    mixerError: state.error,
    ...actions,
  };
}

export type KonomiHook = ReturnType<typeof useKonomi>;
