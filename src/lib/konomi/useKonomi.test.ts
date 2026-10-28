import { describe, expect, it } from "vitest";
import { catalog, tags, T } from "./__fixtures__/catalog";
import { DEFAULT_RESULT_COUNT, SLOT_COUNT } from "./config";
import { createInitialState, reducer, type Action, type KonomiState } from "./useKonomi";

// Drives the pure reducer directly — no React, no DOM — which is the whole
// point of useKonomi's "framework-light" design. Where scorePool shuffles,
// tests assert on SETS of ids, never on order, except where the reducer
// itself guarantees an order (lock compaction).

function run(actions: Action[], from: KonomiState = createInitialState({ series: catalog, tags })): KonomiState {
  return actions.reduce(reducer, from);
}
const select = (...ids: string[]): Action[] => ids.map((tagId) => ({ type: "TOGGLE_TAG", tagId }));
const resultIds = (s: KonomiState) => s.results.map((r) => r.series.id);

describe("slots", () => {
  it("toggles a tag into the first empty slot and out again", () => {
    let s = run(select(T.action));
    expect(s.slots).toEqual([T.action, null, null]);
    s = run(select(T.action), s);
    expect(s.slots).toEqual([null, null, null]);
  });
  it("ignores a toggle when every slot is full", () => {
    const s = run(select(T.action, T.mecha, T.school, T.drama));
    expect(s.slots).toEqual([T.action, T.mecha, T.school]);
  });
  it("PLACE_IN_SLOT swaps when dragging between two filled slots", () => {
    const s = run([...select(T.action, T.mecha), { type: "PLACE_IN_SLOT", index: 1, tagId: T.action }]);
    expect(s.slots).toEqual([T.mecha, T.action, null]);
  });
  it("PLACE_IN_SLOT from the pool overwrites the target", () => {
    const s = run([...select(T.action), { type: "PLACE_IN_SLOT", index: 0, tagId: T.drama }]);
    expect(s.slots).toEqual([T.drama, null, null]);
  });
  it("RANDOM_TAGS fills up to SLOT_COUNT from the visible list only", () => {
    const s = run([{ type: "RANDOM_TAGS", visible: [T.action, T.drama] }]);
    expect(s.slots.filter(Boolean).sort()).toEqual([T.action, T.drama]);
    expect(s.slots).toHaveLength(SLOT_COUNT);
  });
  it("PRUNE_TAGS clears only slots outside the visible set", () => {
    const s = run([...select(T.action, T.rare), { type: "PRUNE_TAGS", visible: new Set([T.action]) }]);
    expect(s.slots).toEqual([T.action, null, null]);
  });
});

describe("RECOMMEND", () => {
  it("does nothing with no tags selected", () => {
    const s = run([{ type: "RECOMMEND" }]);
    expect(s.generated).toBe(false);
    expect(s.results).toEqual([]);
  });
  it("fills up to DEFAULT_RESULT_COUNT with qualifying titles", () => {
    const s = run([...select(T.action), { type: "RECOMMEND" }]);
    expect(resultIds(s).sort()).toEqual(["anilist:1", "anilist:2", "anilist:3"]);
    expect(s.results.length).toBeLessThanOrEqual(DEFAULT_RESULT_COUNT);
    expect(s.error).toBeNull();
    expect(s.recommendGen).toBe(1);
    expect(s.newIds.sort()).toEqual(["anilist:1", "anilist:2", "anilist:3"]);
    expect(s.firstNewIndex).toBe(0);
  });
  it("errors impossible-min when fewer tags than min-match, leaving results alone", () => {
    const s = run([...select(T.action), { type: "SET_MIN_MATCH", key: "2" }, { type: "RECOMMEND" }]);
    expect(s.error).toBe("impossible-min");
    expect(s.results).toEqual([]);
  });
  it("errors no-match when nothing qualifies", () => {
    const s = run([...select(T.space, T.rare), { type: "SET_MIN_MATCH", key: "2" }, { type: "RECOMMEND" }]);
    expect(s.error).toBe("no-match");
  });
  it("errors no-new-matches when every qualifying title is already on screen", () => {
    const first = run([...select(T.action), { type: "RECOMMEND" }]);
    const again = reducer(first, { type: "RECOMMEND" });
    expect(again.error).toBe("no-new-matches");
    expect(resultIds(again)).toEqual(resultIds(first));
    expect(again.recommendGen).toBe(first.recommendGen);
  });
  it("compacts locked cards to the front and records the previous batch", () => {
    // Only one title (D) matches Rare+Drama at min 2; A/B/C match Action.
    let s = run([...select(T.action), { type: "RECOMMEND" }]);
    const lockedId = resultIds(s)[2];
    s = run([{ type: "TOGGLE_LOCK", id: lockedId }, { type: "CLEAR_SLOTS" }, ...select(T.drama, T.rare), { type: "SET_MIN_MATCH", key: "2" }, { type: "RECOMMEND" }], s);
    expect(s.error).toBeNull();
    expect(resultIds(s)).toEqual([lockedId, "anilist:4"]);
    expect(s.firstNewIndex).toBe(1);
    expect(s.newIds).toEqual(["anilist:4"]);
    expect(s.prevResultIds).toHaveLength(3);
  });
});

describe("locks and errors", () => {
  it("arms all-locked proactively when the last open card is locked, and clears on unlock", () => {
    let s = run([...select(T.rare), { type: "RECOMMEND" }]);
    expect(resultIds(s)).toEqual(["anilist:4"]);
    s = reducer(s, { type: "TOGGLE_LOCK", id: "anilist:4" });
    expect(s.error).toBe("all-locked");
    s = reducer(s, { type: "TOGGLE_TAG", tagId: T.action });
    expect(s.error).toBe("all-locked"); // tag changes never clear it
    s = reducer(s, { type: "UNLOCK_ALL" });
    expect(s.error).toBeNull();
  });
  it("clears no-match on any tag change and impossible-min once satisfiable", () => {
    let s = run([...select(T.space, T.rare), { type: "SET_MIN_MATCH", key: "2" }, { type: "RECOMMEND" }]);
    expect(s.error).toBe("no-match");
    s = reducer(s, { type: "TOGGLE_TAG", tagId: T.action });
    expect(s.error).toBeNull();
    s = run([{ type: "CLEAR_SLOTS" }, ...select(T.action), { type: "SET_MIN_MATCH", key: "3" }, { type: "RECOMMEND" }], s);
    expect(s.error).toBe("impossible-min");
    s = reducer(s, { type: "SET_MIN_MATCH", key: "1" });
    expect(s.error).toBeNull();
  });
});

describe("REPLACE_CARD and CLEAR_RECS", () => {
  it("swaps one unlocked card for a qualifying title not on screen", () => {
    // Action matches A, B, C; only 2 slots would show if we limit — use min 1
    // and exclude via locks: lock A and B's positions can't be controlled, so
    // assert the invariant instead of a specific id.
    let s = run([...select(T.action), { type: "RECOMMEND" }]);
    const before = resultIds(s);
    // With all three on screen, a swap has nowhere to go → no-op.
    s = reducer(s, { type: "REPLACE_CARD", id: before[0] });
    expect(resultIds(s)).toEqual(before);
    // Narrow the mix so a fresh title exists off-screen.
    s = run([{ type: "CLEAR_SLOTS" }, ...select(T.drama), { type: "RECOMMEND" }]);
    const shown = resultIds(s); // C and D
    expect(shown.sort()).toEqual(["anilist:3", "anilist:4"]);
  });
  it("refuses to replace a locked card", () => {
    let s = run([...select(T.action), { type: "RECOMMEND" }]);
    const id = resultIds(s)[0];
    s = reducer(s, { type: "TOGGLE_LOCK", id });
    expect(reducer(s, { type: "REPLACE_CARD", id })).toBe(s);
  });
  it("CLEAR_RECS keeps locked cards, drops everything else, bumps clearGen", () => {
    let s = run([...select(T.action), { type: "RECOMMEND" }]);
    const keep = resultIds(s)[1];
    s = run([{ type: "TOGGLE_LOCK", id: keep }, { type: "CLEAR_RECS" }], s);
    expect(resultIds(s)).toEqual([keep]);
    expect(s.locked).toEqual({ [keep]: true });
    expect(s.clearGen).toBe(1);
    s = run([{ type: "UNLOCK_ALL" }, { type: "CLEAR_RECS" }], s);
    expect(s.results).toEqual([]);
    expect(s.generated).toBe(false);
    expect(s.clearGen).toBe(2);
  });
});
