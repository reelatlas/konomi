import { describe, expect, it } from "vitest";
import { tags, T } from "./__fixtures__/catalog";
import { animeDomain } from "./animeDomain";
import { filmDomain } from "./filmDomain";
import { sortTags, visiblePoolTagIds } from "./tagPool";
import type { TagInfo } from "./types";

describe("sortTags", () => {
  const names = (t: TagInfo[]) => t.map((x) => x.name);
  it("sorts by count both ways and by name both ways without mutating input", () => {
    const copy = [...tags];
    expect(names(sortTags(tags, "popular"))[0]).toBe("Action");
    expect(names(sortTags(tags, "unpopular"))[0]).toMatch(/Space|Rare/);
    expect(names(sortTags(tags, "az"))[0]).toBe("Action");
    expect(names(sortTags(tags, "za"))[0]).toBe("Space");
    expect(tags).toEqual(copy);
  });
});

describe("anime visibility", () => {
  it("level 1 shows genres only; level 3 applies the rank baseline", () => {
    const l1 = visiblePoolTagIds(animeDomain, tags, "1", 4);
    expect(l1.sort()).toEqual([T.action, T.drama].sort());
    const l3 = visiblePoolTagIds(animeDomain, tags, "3", 4);
    expect(l3).toContain(T.mecha);
    expect(l3).toContain(T.space); // rank 50 ≥ baseline 40
    expect(l3).not.toContain(T.rare); // rank 20 < baseline
  });
  it("level 2 needs both the rank threshold and the series-count share", () => {
    const l2 = visiblePoolTagIds(animeDomain, tags, "2", 4);
    expect(l2).toContain(T.mecha); // rank 80, 2 of 4 series
    expect(l2).not.toContain(T.space); // rank 50 < 70
  });
  it("never surfaces a tag whose category is mapped to no section", () => {
    const technical: TagInfo = { id: "anilist-tag:7", name: "CGI", category: "Technical", seriesCount: 4, avgRank: 99, isGenre: false };
    expect(visiblePoolTagIds(animeDomain, [...tags, technical], "3", 4)).not.toContain(technical.id);
  });
});

describe("film visibility", () => {
  const mk = (id: string, category: string, minLevel?: "1" | "2" | "3"): TagInfo => ({ id, name: id, category, seriesCount: 1, avgRank: null, isGenre: false, minLevel });
  it("reads the stored min_level and fails closed without one", () => {
    const pool = [mk("tmdb-tag:kw:heist", "Crime", "2"), mk("tmdb-tag:kw:noir", "Sub-genres", "3"), mk("tmdb-tag:kw:bug", "Crime")];
    expect(visiblePoolTagIds(filmDomain, pool, "1", 0)).toEqual([]);
    expect(visiblePoolTagIds(filmDomain, pool, "2", 0)).toEqual(["tmdb-tag:kw:heist"]);
    expect(visiblePoolTagIds(filmDomain, pool, "3", 0).sort()).toEqual(["tmdb-tag:kw:heist", "tmdb-tag:kw:noir"]);
  });
});

describe("cardMeta", () => {
  it("formats each side's facts and drops nulls independently", () => {
    const base = { id: "x", title: "x", tags: [], coverImageUrl: null, genres: [], averageScore: null, description: null, streamingServices: [] };
    expect(animeDomain.cardMeta({ ...base, year: 2001, eps: 24 })).toBe("2001 · 24 EP");
    expect(animeDomain.cardMeta({ ...base, year: null, eps: null })).toBe("TBA");
    expect(filmDomain.cardMeta({ ...base, year: 1999, eps: null, runtimeMin: 139, certification: "R" })).toBe("1999 · 2H 19M · R");
    expect(filmDomain.cardMeta({ ...base, year: 2020, eps: null, runtimeMin: 45, certification: null })).toBe("2020 · 45M");
  });
});
