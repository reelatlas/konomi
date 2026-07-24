import { supabase } from "./client";
import type { Catalog } from "./queries";
import type { LevelKey, Series, TagInfo } from "@/lib/konomi/types";

// Adapts the film partition (films / film_tags / film_tag_links, migration
// 0012) into the app's shared Series/TagInfo shapes, so useKonomi/scoring/
// the pool never know which side the data came from — the same contract
// getCatalog() gives the anime side. Two kinds of tags come out of this:
//
//   STORED   film_tags rows (kw / saga / people / studio), promoted by
//            scripts/promote-tmdb.ts with a stored min_level; their section
//            comes from the tag-rules master (kw) or their type (credits).
//   SYNTHESIZED  tags derived here from films columns — genres, reception,
//            decade, country, original language, certification — exactly
//            like the anime side synthesizes genre tags. Their level gates
//            come from adapter-config.json's banked rules (reception all
//            levels; origin/certification film buff+).
//
// NAME COLLISIONS are real and semantic: kw Era holds "1990s" (story SET in
// the 90s) while origin decade means MADE in the 90s; kw Map holds "Mexico"
// (set there) vs. the production country. Tags are name-keyed app-wide
// (slots, scoring, tagInfoByName), so synthesized origin tags get distinct,
// self-describing names ("1990s release", "made in Mexico", "in French",
// "rated R") — which also keeps them legible in a slot or on a card where
// the section context is gone. Pure display renames, tweak freely.

// TMDB image CDN. w500 posters comfortably cover the 244px card cap at 2×;
// w92 is the provider-logo size the anime-side chips render at.
const TMDB_IMG = "https://image.tmdb.org/t/p";

const MIN_LEVEL_MAP: Record<string, LevelKey> = { moviegoer: "1", "film buff": "2", cinephile: "3" };

// Credit/saga rows carry no pillar/section in the DB (null) — their pool
// home is a UI decision, assigned here via type. The category strings are
// the contract with filmDomain's section tree; change both together.
const TYPE_CATEGORY: Record<string, string> = {
  saga: "Sagas", // merges with kw section "Sagas" (sequel/prequel/remake/reboot/spin off) — the banked "ONE Sagas home"
  actor: "People-Actors",
  director: "People-Directors",
  producer: "People-Producers",
  cinematographer: "People-Cinematographers",
  composer: "People-Composers",
  studio: "People-Studios",
};

// TMDB's original_language codes are ISO 639-1 except its Chinese split:
// "cn" = Cantonese, "zh" = Mandarin (not what Intl says). Everything else
// resolves through Intl.DisplayNames; unknown codes fall back to the code.
const LANGUAGE_OVERRIDES: Record<string, string> = { cn: "Cantonese", zh: "Mandarin" };
const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
function languageName(code: string): string {
  if (LANGUAGE_OVERRIDES[code]) return LANGUAGE_OVERRIDES[code];
  try {
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

// Chip-length shortenings for TMDB's longest country names — display only.
const COUNTRY_SHORTENINGS: Record<string, string> = {
  "United States of America": "USA",
  "United Kingdom": "UK",
};
const countryTagName = (c: string) => `made in ${COUNTRY_SHORTENINGS[c] ?? c}`;
const decadeTagName = (d: string) => `${d} release`;
const languageTagName = (code: string) => `in ${languageName(code)}`;
const certTagName = (cert: string) => `rated ${cert}`;

interface RawFilmRow {
  title: string;
  year: number | null;
  runtime: number | null;
  rating: number | null;
  genres: string[] | null;
  reception: string[] | null;
  certification: string | null;
  original_language: string | null;
  countries: string[] | null;
  decade: string | null;
  saga_name: string | null;
  overview: string | null;
  poster_path: string | null;
  watch_providers: { name: string; logo_path: string | null }[] | null;
  watch_link: string | null;
  film_tag_links: { film_tags: { name: string } | null }[] | null;
}

interface RawFilmTagRow {
  type: string;
  name: string;
  section: string | null;
  film_count: number;
  min_level: string;
}

const PAGE = 500;

// Count the table once, then fetch the pages CONCURRENTLY in bounded waves
// — the pages are independent range reads over a stable ORDER BY, so fully
// serializing them was pure wasted wall-clock (measured: the sequential
// version's ~33 dependent round trips dominated /film's load, worst in dev
// where nothing caches the route). Bounded, not unbounded: firing all 18
// film pages at once hit Postgres statement timeouts (each page joins the
// 177k-row links table — measured, not theoretical), so waves of
// PAGE_CONCURRENCY keep the DB comfortably inside its limits while still
// collapsing the latency. Pages land in index order either way, so the
// result is exactly as ordered as the sequential loop's was.
const PAGE_CONCURRENCY = 5;

async function fetchAllPaged<T>(table: string, select: string, orderCol: string, pageSize: number): Promise<T[]> {
  const { count, error: countError } = await supabase.from(table).select(orderCol, { count: "exact", head: true });
  if (countError || count === null) {
    throw new Error(`Failed to count ${table} from Supabase: ${countError?.message ?? "no count returned"}`);
  }
  const pageCount = Math.ceil(count / pageSize);
  const fetchPage = (i: number) =>
    supabase
      .from(table)
      .select(select)
      .order(orderCol)
      .range(i * pageSize, i * pageSize + pageSize - 1)
      .then(({ data, error }) => {
        if (error) throw new Error(`Failed to load ${table} from Supabase: ${error.message}`);
        return (data ?? []) as T[];
      });
  const pages: T[][] = [];
  for (let start = 0; start < pageCount; start += PAGE_CONCURRENCY) {
    const wave = await Promise.all(
      Array.from({ length: Math.min(PAGE_CONCURRENCY, pageCount - start) }, (_, j) => fetchPage(start + j)),
    );
    pages.push(...wave);
  }
  return pages.flat();
}

export async function getFilmCatalog(): Promise<Catalog> {
  // Stored tags (~15k rows) and films-with-linked-tag-names (the anime-side
  // resource-embedding pattern) — the two fetches are independent of each
  // other too, so they also run concurrently. film_count/min_level are
  // already computed by the promote script, so no client-side stat pass is
  // needed the way the anime side derives seriesCount/avgRank.
  const [tagRows, rows] = await Promise.all([
    fetchAllPaged<RawFilmTagRow>("film_tags", "type, name, section, film_count, min_level", "id", 1000),
    // Ordered by tmdb_id, not title: range pagination needs a UNIQUE sort
    // column or rows can straddle page boundaries on ties (duplicate
    // titles genuinely exist — remakes), silently duplicating/dropping
    // films. Series order doesn't matter downstream (scorePool shuffles).
    fetchAllPaged<RawFilmRow>(
      "films",
      "title, year, runtime, rating, genres, reception, certification, original_language, countries, decade, saga_name, overview, poster_path, watch_providers, watch_link, film_tag_links(film_tags(name))",
      "tmdb_id",
      PAGE,
    ),
  ]);

  const storedTags: TagInfo[] = tagRows.map((t) => ({
    name: t.name,
    // kw rows carry their master-ruled section; credit/saga rows carry
    // null and get their home from their type.
    category: t.type === "kw" ? t.section : (TYPE_CATEGORY[t.type] ?? null),
    seriesCount: t.film_count,
    avgRank: null,
    isGenre: false,
    minLevel: MIN_LEVEL_MAP[t.min_level] ?? "3",
  }));

  // Synthesized-tag film counts, accumulated in one pass.
  const counts = {
    genre: new Map<string, number>(),
    reception: new Map<string, number>(),
    decade: new Map<string, number>(),
    country: new Map<string, number>(),
    language: new Map<string, number>(),
    cert: new Map<string, number>(),
  };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  const series: Series[] = rows.map((row) => {
    const linked = (row.film_tag_links ?? [])
      .map((l) => l.film_tags?.name)
      .filter((n): n is string => Boolean(n));

    // Synthesized tag names for this film — they join `tags` so scoring
    // matches them exactly like stored tags, with zero engine changes.
    const synthesized: string[] = [];
    for (const r of row.reception ?? []) {
      synthesized.push(r);
      bump(counts.reception, r);
    }
    if (row.decade) {
      synthesized.push(decadeTagName(row.decade));
      bump(counts.decade, row.decade);
    }
    for (const c of row.countries ?? []) {
      synthesized.push(countryTagName(c));
      bump(counts.country, c);
    }
    if (row.original_language) {
      synthesized.push(languageTagName(row.original_language));
      bump(counts.language, row.original_language);
    }
    // One raw row carries "PG-13 " with a trailing space — trim on read,
    // same class of raw-data quirk the promote script trims on keywords.
    const cert = row.certification?.trim() || null;
    if (cert) {
      synthesized.push(certTagName(cert));
      bump(counts.cert, cert);
    }
    for (const g of row.genres ?? []) bump(counts.genre, g);

    return {
      title: row.title,
      year: row.year,
      eps: null,
      // Set-dedupe: one person credited in multiple roles on the SAME film
      // (Tom Six directs AND produces) links two same-named tags, and the
      // duplicate name reaching the card's tag row was a real React
      // duplicate-key error (confirmed live). A film's tag list is
      // conceptually a set; scoring (includes-based) is unaffected.
      tags: [...new Set([...linked, ...synthesized])],
      coverImageUrl: row.poster_path ? `${TMDB_IMG}/w500${row.poster_path}` : null,
      genres: row.genres ?? [],
      // ×10: TMDB's 0-10 vote_average onto the shared 0-100 scale — see
      // Series.averageScore in types.ts.
      averageScore: row.rating != null ? Math.round(row.rating * 10) : null,
      description: row.overview,
      // Every provider links to the film's one JustWatch-powered TMDB watch
      // page (per-provider deep links aren't in the data) — the chips are
      // "what's streaming it", the click goes to the picker. icon stays
      // null DELIBERATELY: the chip renders icons as a CSS alpha-mask
      // (built for AniList's transparent white-glyph PNGs — see
      // ResultCard's own comment), and TMDB provider logos are opaque
      // JPGs, which mask to a solid square. Label-only chips until a
      // plain-<img> render mode is worth adding; the logo URL would be
      // `${TMDB_IMG}/w92${p.logo_path}` when it is.
      streamingServices: row.watch_link
        ? (row.watch_providers ?? []).map((p) => ({
            name: p.name,
            url: row.watch_link as string,
            icon: null,
            color: null,
          }))
        : [],
      runtimeMin: row.runtime,
      certification: cert,
      sagaName: row.saga_name,
    };
  });

  // Synthesized TagInfo entries. Level gates per adapter-config.json:
  // reception ships at every level (moviegoer included); origin +
  // certification are film buff+ ("1" would be the one-line change).
  const synthTags: TagInfo[] = [
    ...[...counts.reception.entries()].map(([name, n]) => tagInfo(name, receptionCategory(name), n, "1")),
    ...[...counts.decade.entries()].map(([d, n]) => tagInfo(decadeTagName(d), "Origin-Decade", n, "2")),
    ...[...counts.country.entries()].map(([c, n]) => tagInfo(countryTagName(c), "Origin-Country", n, "2")),
    ...[...counts.language.entries()].map(([c, n]) => tagInfo(languageTagName(c), "Origin-Language", n, "2")),
    ...[...counts.cert.entries()].map(([c, n]) => tagInfo(certTagName(c), "Origin-Rated", n, "2")),
  ];

  // Genres mirror the anime convention exactly: isGenre: true short-circuits
  // every level check (wt-100, always visible), category null.
  const genreTags: TagInfo[] = [...counts.genre.entries()].map(([name, count]) => ({
    name,
    category: null,
    seriesCount: count,
    avgRank: null,
    isGenre: true,
  }));

  // Merge stored tags that share a (category, name) pair — DISTINCT DB tags
  // whose display names collide: two different actors both named "Michael
  // Gough", TMDB's separate regional company records for "Netflix"/"Sony
  // Pictures", two De Laurentiis producers. The app identifies tags by name
  // (slots, scoring, chip keys), so two same-named chips in one sub-tab
  // were both a real React duplicate-key error (confirmed live) and
  // functionally identical anyway — selecting either matches films from
  // both entities. One chip, with seriesCount recomputed as the TRUE
  // number of films carrying the name (not a sum, which would double-count
  // a film linked to both same-named tags); minLevel takes the most
  // permissive of the group. If per-entity identity ever matters, that's
  // the key-based-matching refactor, not a rendering patch.
  const dupNames = new Set<string>();
  {
    const seen = new Set<string>();
    for (const t of storedTags) {
      const k = `${t.category}::${t.name}`;
      if (seen.has(k)) dupNames.add(t.name);
      else seen.add(k);
    }
  }
  const trueNameCounts = new Map<string, number>();
  if (dupNames.size > 0) {
    for (const s of series) for (const n of s.tags) if (dupNames.has(n)) trueNameCounts.set(n, (trueNameCounts.get(n) ?? 0) + 1);
  }
  const mergedStored = new Map<string, TagInfo>();
  for (const t of storedTags) {
    const k = `${t.category}::${t.name}`;
    const existing = mergedStored.get(k);
    if (!existing) {
      mergedStored.set(k, dupNames.has(t.name) ? { ...t, seriesCount: trueNameCounts.get(t.name) ?? t.seriesCount } : t);
    } else if (t.minLevel && existing.minLevel && Number(t.minLevel) < Number(existing.minLevel)) {
      existing.minLevel = t.minLevel;
    }
  }

  const tags = [...mergedStored.values(), ...synthTags, ...genreTags].sort((a, b) => a.name.localeCompare(b.name));

  return { series, tags };
}

function tagInfo(name: string, category: string, seriesCount: number, minLevel: LevelKey): TagInfo {
  return { name, category, seriesCount, avgRank: null, isGenre: false, minLevel };
}

// Reception splits into two sub-tabs (user, 2026-07-24): the money tags vs
// everything about how the film was received/regarded. The six box-office
// tags are the closed banked set (per adapter-config stacking rules: the
// four ROI bands are mutually exclusive; blockbuster/big-budget stack) —
// any FUTURE reception tag lands in Impact unless added here.
const BOX_OFFICE_RECEPTION = new Set(["blockbuster", "big-budget", "mega-roi", "hit", "broke-even", "flop"]);
const receptionCategory = (name: string) => (BOX_OFFICE_RECEPTION.has(name) ? "Reception-Box office" : "Reception-Impact");
