import { describe, expect, it } from "vitest";
import { catalog, T } from "./__fixtures__/catalog";
import { scorePool, scoreSeries } from "./scoring";

describe("scoreSeries", () => {
  it("counts selected ids the series is a member of, genres included", () => {
    expect(scoreSeries(catalog[0], [T.action, T.mecha, T.drama])).toBe(2);
    expect(scoreSeries(catalog[3], [T.action, T.mecha])).toBe(0);
  });
  it("is 0 for an empty selection", () => {
    expect(scoreSeries(catalog[0], [])).toBe(0);
  });
});

describe("scorePool", () => {
  const ids = (pool: { series: { id: string } }[]) => pool.map((p) => p.series.id).sort();

  it("treats min as a floor, not an exact count", () => {
    expect(ids(scorePool(catalog, [T.action, T.mecha, T.school], 1, new Set()))).toEqual(["anilist:1", "anilist:2", "anilist:3"]);
    expect(ids(scorePool(catalog, [T.action, T.mecha, T.school], 2, new Set()))).toEqual(["anilist:1", "anilist:2", "anilist:3"]);
    expect(ids(scorePool(catalog, [T.action, T.mecha, T.school], 3, new Set()))).toEqual(["anilist:2"]);
  });
  it("excludes ids it is told to", () => {
    expect(ids(scorePool(catalog, [T.action], 1, new Set(["anilist:1", "anilist:2"])))).toEqual(["anilist:3"]);
  });
  it("returns every qualifying title exactly once, in some order", () => {
    const pool = scorePool(catalog, [T.action], 1, new Set());
    expect(pool).toHaveLength(3);
    expect(new Set(pool.map((p) => p.series.id)).size).toBe(3);
  });
});
