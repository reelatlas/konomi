import { useEffect, useMemo, useReducer, useRef } from "react";
import { DEFAULT_RESULT_COUNT, SLOT_COUNT } from "./config";
import { scorePool, scoreSeries } from "./scoring";
import type { MatchKey, MixerError, ResultEntry, Series, Slot, TagInfo, ThemeKey } from "./types";

interface KonomiState {
  series: Series[];
  tags: TagInfo[];
  slots: Slot[];
  results: ResultEntry[];
  generated: boolean;
  dragOverIndex: number;
  minMatch: MatchKey;
  flipped: Record<string, boolean>;
  locked: Record<string, boolean>;
  theme: ThemeKey;
  error: MixerError;
  // Bumped only on a successful RECOMMEND (never on error, never on a
  // single-card REPLACE_CARD swap) — a signal the results carousel watches
  // to reset its scroll position back to the first card on a fresh batch,
  // while leaving scroll position alone when just one card changes. Not
  // derived from `results` itself, since both a fresh RECOMMEND and a swap
  // produce a new `results` array reference — this is the one field that
  // distinguishes "a whole new batch" from "one card changed."
  recommendGen: number;
}

// Lazy initializer for useReducer — the catalog is only known at the time
// useKonomi() is called (fetched server-side, passed in as props), so the
// initial state can't be a static module-level constant the way it used to
// be when series/tags were hardcoded imports.
function createInitialState(catalog: { series: Series[]; tags: TagInfo[] }): KonomiState {
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
    error: null,
    recommendGen: 0,
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
// new search succeed", not "is anything currently displayed"). On either
// error, `results` is deliberately left untouched — stale results stay on
// screen exactly as they were until a genuinely new RECOMMEND succeeds or
// the user hits Clear ✕.
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

  // Walks the raw stored order directly — there's no separate "visible
  // order" to reconcile against anymore. The displayed set is always
  // exactly `state.results`; nothing hides between RECOMMENDs, so stored
  // order and displayed order can never diverge. Locked entries are carried
  // forward unconditionally at their existing position; non-locked slots
  // get the next fresh pool pick, or are dropped (compacting, no gaps) if
  // the pool runs short.
  let pi = 0;
  const out: ResultEntry[] = [];
  for (let i = 0; i < DEFAULT_RESULT_COUNT; i++) {
    const old = state.results[i];
    if (old && lockedTitles.has(old.series.title)) {
      out.push({ series: old.series });
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
  return { ...state, results: out, generated: true, flipped, error: null, recommendGen: state.recommendGen + 1 };
}

// Shared by every reducer branch that mutates `slots` — re-evaluates
// whether an active error still applies to the CURRENT state, rather than
// only clearing on the specific action that originally set it. "no-match"
// clears unconditionally (any tag change is a fresh attempt worth trying
// again). "impossible-min" clears the moment tag count no longer makes it
// impossible: either tag count rises to >= min-match (adding a tag back,
// Random ×3 refilling all slots) or tag count drops to exactly zero (the
// global override, back to the plain disabled-no-error zero state — a
// separate condition from ">= min-match", since min-match can never be
// lower than "1", so zero tags never satisfies that check on its own).
// Lowering min-match itself is a different clearing path, handled by
// SET_MIN_MATCH below — min-match is a deliberate setting the app never
// silently changes just because tags moved.
function clearErrorForTagChange(state: KonomiState, slots: Slot[]): MixerError {
  if (state.error === "no-match") return null;
  if (state.error === "impossible-min") {
    const tagCount = selectedTags(slots).length;
    const min = Number(state.minMatch);
    if (tagCount === 0 || tagCount >= min) return null;
  }
  return state.error;
}

// Targets by title, not array index — the same stable identifier
// `TOGGLE_LOCK`/`TOGGLE_FLIP` already use, so a swap can't be thrown off by
// whatever positional assumptions the rendering layer happens to make.
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
  return { ...state, slots, error: clearErrorForTagChange(state, slots) };
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
      if (ex === action.index) return state; // dropped back onto its own slot — no-op
      // Swap, not destroy: if the dragged tag came from another slot (ex >= 0)
      // and the target slot already held a different tag, that displaced tag
      // moves into the source's old spot instead of just vanishing — dragging
      // between two filled slots in the 3-tag group trades their positions.
      // Dragging in from the pool (ex === -1, the tag wasn't in any slot yet)
      // skips this branch entirely, leaving the target's previous tag simply
      // overwritten/deselected, same as before this change.
      const displaced = s[action.index];
      if (ex >= 0) s[ex] = displaced;
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
export function useKonomi(initialSeries: Series[], initialTags: TagInfo[]) {
  const [state, dispatch] = useReducer(reducer, { series: initialSeries, tags: initialTags }, createInitialState);

  // Mirrors `state` for `actions.recommend` below to read synchronously —
  // `actions` itself is memoized with an empty dep array (stable identity
  // for every other action, which only ever fire-and-forget a plain
  // dispatch), so a closure inside it can't read `state` directly without
  // being permanently stuck on whatever `state` was during the first
  // render. Written via an effect (not during render) for the same reason
  // MixerBar's own ref-mirrors are — assigning `ref.current` inline in the
  // render body trips `react-hooks/refs`. By the time a user can click
  // Recommend, the previous render's effects have already committed, so
  // this is always the latest state whenever `actions.recommend` reads it.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

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
      // Returns the MixerError the click just produced (or null on success)
      // synchronously — a caller (KonomiApp) that needs to know the outcome
      // right away, e.g. to decide whether to close edit mode, can't just
      // dispatch-and-read-state-after, since a reducer update isn't visible
      // until the next render. `recommend` (the pure function above) is
      // called directly here, against the always-current `stateRef`, purely
      // to extract that answer — `dispatch` below still fires normally and
      // lets the reducer recompute and apply the same result on its own;
      // the duplicate computation is a deliberately cheap tradeoff (this
      // scores against a hobby-scale catalog, not a hot loop) for not
      // having to route the actual state update through anything other than
      // the standard action-object dispatch path.
      //
      // Safe ONLY because `recommend` is pure — same state in, same state
      // (and same .error) out, every time, both calls agreeing by
      // construction. If it ever gains a side effect or non-determinism
      // (a random tiebreak, a timestamp, anything reading outside its own
      // `state` argument), these two calls can diverge — the error
      // returned here would stop reliably matching the one actually
      // applied, and this shortcut would need to go through a single
      // computation instead (e.g. dispatch a precomputed next-state rather
      // than an action type, or lift the result out via a ref written
      // inside the reducer). Keep `recommend` pure, or revisit this.
      recommend: () => {
        const error = recommend(stateRef.current).error;
        dispatch({ type: "RECOMMEND" });
        return error;
      },
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
    dragOverIndex: state.dragOverIndex,
    minMatch: state.minMatch,
    flipped: state.flipped,
    locked: state.locked,
    theme: state.theme,
    allTags: state.tags,
    tagInfoByName,
    totalSeriesCount: state.series.length,
    selectedTags: sel,
    filledCount,
    minNum,
    canSwap,
    resultsHint,
    lockedLabel: `${filledCount}/${SLOT_COUNT}`,
    hasResults: state.generated && state.results.length > 0,
    mixerError: state.error,
    recommendGen: state.recommendGen,
    ...actions,
  };
}
