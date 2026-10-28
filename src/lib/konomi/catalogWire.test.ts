import { describe, expect, it } from "vitest";
import { catalog, series, tags, T } from "./__fixtures__/catalog";
import { packCatalog, packTags, unpackCatalog, unpackTags, WIRE_VERSION } from "./catalogWire";

describe("catalogWire", () => {
  it("round-trips an anime catalog exactly", () => {
    const rich = [
      ...catalog,
      series("anilist:5", "E", [T.drama], {
        year: null,
        eps: null,
        coverImageUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.jpg",
        genres: ["Drama"],
        averageScore: 81,
        description: "Two lines.\nOf text.",
        streamingServices: [
          { name: "Crunchyroll", url: "https://cr.example/1", icon: "https://i/1.png", color: "#f47521" },
          { name: "Netflix", url: "https://nf.example/1", icon: null, color: null },
        ],
      }),
    ];
    const out = unpackCatalog(packCatalog({ series: rich, tags }));
    expect(out.series).toEqual(rich);
    expect(out.tags).toEqual(tags);
  });

  it("round-trips tags, sharing categories and keeping minLevel absent where it was", () => {
    const filmTags = [
      { ...tags[2], id: "tmdb-tag:person:actor:1", category: "People-Actors", minLevel: "2" as const },
      { ...tags[3], id: "tmdb-tag:person:actor:2", category: "People-Actors", minLevel: "2" as const },
      { ...tags[0], id: "tmdb-genre:Action" },
    ];
    const wire = packTags([...tags, ...filmTags]);
    expect(wire.categories).toEqual(["Theme-Sci-Fi-Mecha", "Setting-Scene", "Setting-Universe", "Theme-Other", "People-Actors"]);
    const out = unpackTags(wire);
    expect(out).toEqual([...tags, ...filmTags]);
    expect("minLevel" in out[0]).toBe(false);
    expect("minLevel" in out[6]).toBe(true);
  });

  it("round-trips film optionals and keeps them absent on anime items", () => {
    const film = series("tmdb:1", "F", [T.action], { runtimeMin: 139, certification: "R", sagaName: null });
    const out = unpackCatalog(packCatalog({ series: [film, catalog[0]], tags }));
    expect(out.series[0]).toEqual(film);
    expect("runtimeMin" in out.series[1]).toBe(false);
    expect("sagaName" in out.series[1]).toBe(false);
  });

  it("dedupes repeated stream URLs and poster prefixes into shared tables", () => {
    const url = "https://www.themoviedb.org/movie/1/watch";
    const films = [1, 2, 3].map((n) =>
      series(`tmdb:${n}`, `F${n}`, [T.action], {
        coverImageUrl: `https://image.tmdb.org/t/p/w500/p${n}.jpg`,
        streamingServices: [
          { name: "Netflix", url, icon: null, color: null },
          { name: "Hulu", url, icon: null, color: null },
        ],
      }),
    );
    const wire = packCatalog({ series: films, tags });
    expect(wire.urls).toEqual([url]);
    expect(wire.prefixes).toEqual(["https://image.tmdb.org/t/p/w500/"]);
    expect(unpackCatalog(wire).series).toEqual(films);
  });

  it("drops membership ids that have no TagInfo", () => {
    const s = series("anilist:9", "Orphan", [T.action, "anilist-tag:999"]);
    const out = unpackCatalog(packCatalog({ series: [s], tags }));
    expect(out.series[0].tags).toEqual([T.action]);
  });

  it("refuses a wire version it does not know", () => {
    const wire = packCatalog({ series: catalog, tags });
    expect(() => unpackCatalog({ ...wire, v: (WIRE_VERSION + 1) as typeof WIRE_VERSION })).toThrow(/wire version/);
  });
});
