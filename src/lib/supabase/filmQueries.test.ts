import { describe, expect, it, vi } from "vitest";

// filmQueries imports the Supabase client, which needs env at import time;
// adaptFilmRow is pure, so the client is stubbed out entirely.
vi.mock("./client", () => ({ supabase: {} }));

const { adaptFilmRow } = await import("./filmQueries");

const row = {
  tmdb_id: 603,
  title: "The Matrix",
  year: 1999,
  runtime: 136,
  rating: 8.21,
  genres: ["Action", "Science Fiction", "Action"],
  reception: ["hit", "blockbuster"],
  certification: "R ",
  original_language: "en",
  countries: ["United States of America"],
  decade: "1990s",
  saga_name: "The Matrix",
  overview: "A hacker learns the truth.",
  poster_path: "/p.jpg",
  watch_providers: [{ name: "Max", logo_path: "/l.jpg" }],
  watch_link: "https://www.themoviedb.org/movie/603/watch",
};

describe("adaptFilmRow", () => {
  it("mints every membership id the scoring contract names, deduped", () => {
    const s = adaptFilmRow(row, ["kw:simulation", "person:director:9340", "kw:simulation"]);
    expect(s.id).toBe("tmdb:603");
    expect(s.tags).toEqual([
      "tmdb-tag:kw:simulation",
      "tmdb-tag:person:director:9340",
      "tmdb-synth:reception:hit",
      "tmdb-synth:reception:blockbuster",
      "tmdb-synth:decade:1990s",
      "tmdb-synth:country:United States of America",
      "tmdb-synth:language:en",
      "tmdb-synth:cert:R",
      "tmdb-genre:Action",
      "tmdb-genre:Science Fiction",
    ]);
  });
  it("adapts the display fields onto the shared Series shape", () => {
    const s = adaptFilmRow(row, []);
    expect(s).toMatchObject({
      title: "The Matrix",
      year: 1999,
      eps: null,
      runtimeMin: 136,
      averageScore: 82,
      certification: "R",
      sagaName: "The Matrix",
      genres: ["Action", "Science Fiction", "Action"],
      coverImageUrl: "https://image.tmdb.org/t/p/w500/p.jpg",
      streamingServices: [{ name: "Max", url: row.watch_link, icon: null, color: null }],
    });
  });
  it("treats missing columns as absent, not faked", () => {
    const s = adaptFilmRow(
      { ...row, rating: null, genres: null, reception: null, certification: "  ", original_language: null, countries: null, decade: null, poster_path: null, watch_link: null },
      [],
    );
    expect(s.tags).toEqual([]);
    expect(s.averageScore).toBeNull();
    expect(s.certification).toBeNull();
    expect(s.coverImageUrl).toBeNull();
    expect(s.streamingServices).toEqual([]);
  });
});
