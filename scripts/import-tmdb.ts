// Pulls a TMDB movie corpus into the raw landing table (raw_tmdb_movies).
//
// Run with: npm run import:tmdb
// (uses `tsx --env-file=.env.local`, same as import-anilist.ts)
//
// This is the PULL half only. It deliberately makes no decisions about what
// becomes a tag, what a tag weighs, or which watch-provider region matters —
// those are adapter concerns and live downstream, against the local rows this
// script lands. See 0009_add_tmdb_raw_landing.sql for why the split exists.
//
// The corpus is built to be recognition-heavy — films people have heard of,
// loved, or infamously not loved — rather than exhaustive:
//
//   PROBE   one request per query for total_results, so every take becomes
//           min(target, pool) before the run commits to anything.
//   SEED    seven axes of "known" — infamous / underseen / niche_loved /
//           acclaimed / famous / buzzing / era — as 14 Discover queries
//           (era is per-decade). UNIONed: overlap is expected, recorded, and
//           never resolved here.
//   EXPAND  for directors who show up in the seed with a real body of work,
//           add the rest of their filmography — rounding out careers without
//           pulling in total obscurity.
//   HYDRATE one request per film for the full payload, stored whole.
//
// The bucket names are DISCOVERY axes, not the labels a film wears in the app.
// Nothing here decides that Fight Club is "acclaimed" rather than "famous" —
// it's both, both are recorded, and the adapter applies precedence later where
// changing it costs a query instead of a re-crawl. See the SEED_BUCKETS comment.
//
// Safe to re-run: everything upserts on tmdb_id. But the seed is a PINNED
// SNAPSHOT, not an idempotent query — `buzzing` sorts by TMDB's `popularity`,
// which is recency-weighted and re-ranks daily, and vote counts underneath
// every other bucket only ever grow. A re-run months later selects a
// materially different set. That's a deliberate choice (see fetched_at in the
// migration), not an oversight: re-running moves the snapshot forward, and
// when to do that is an explicit decision.

import { createClient } from "@supabase/supabase-js";

// ── config ──────────────────────────────────────────────────────────────

// Seven axes of "recognition". These are DISCOVERY queries, not labels.
//
// The distinction matters and is the main thing this config gets right. Every
// bucket below is a predicate over vote_average / vote_count / release_date /
// popularity — all four of which are stored in the payload. So the *label* a
// film ends up wearing ("acclaimed", "underseen") is recomputable downstream
// forever, and belongs in the adapter where retuning it is a WHERE clause
// rather than 8,000 requests. All this layer does is decide which films enter
// the corpus at all, which is the one thing that genuinely can't be redone
// locally.
//
// Consequently these buckets UNION and are allowed to overlap freely — a film
// records every bucket that found it (raw_tmdb_movies.seed_buckets is an
// array). Exclusivity at fetch time would buy nothing: Discover returns what it
// returns regardless, dedupe already prevents re-hydration, and forcing one
// label per film would throw away true information (Fight Club genuinely IS
// both acclaimed and famous) that costs nothing to keep.
//
// Floors are calibrated against measured pool sizes, not guessed — an earlier
// draft asked for 1000 `acclaimed` at va>=7.5/vc>=2500 when only 523 such films
// exist on all of TMDB, and 2000 `famous` at vc>=4000 when the pool is 1380.
// The probe below re-checks this every run, so a drifting pool degrades the
// take instead of silently under-filling.
//
// On the two rating-window buckets: `underseen` and `niche_loved` are one
// concept (well-liked but not widely seen) deliberately split into two takes
// rather than one query over vc 100-2500. That's stratified sampling, and it's
// load-bearing — the pools are lopsided (2782 vs 845) and obscure films carry
// inflated ratings from small samples, so a single vote_average.desc sort would
// let the low-vote end eat almost the whole take. Two windows guarantee both
// are represented.
//
// On what's NOT here: there is no `cult` bucket. Cult isn't a numeric property
// — the canon spans the entire rating range (The Room va 3.5 / Fight Club va
// 8.4), so any vote window that catches one admits every bad film or every
// blockbuster. Measured: a vc 2500-15000 window excludes Fight Club (32,351
// votes) and Blade Runner (15,119) while admitting X-Men. TMDB's `cult` keyword
// (id 6158) is no help either — it means films ABOUT cults (Midsommar, Eyes
// Wide Shut), not cult status. The films themselves still land via infamous /
// acclaimed / famous; only the label is unavailable, and if it's ever wanted it
// has to be hand-curated (same precedent as STREAMING_ALLOW_LIST in
// import-anilist.ts), not faked with a vote range.
interface SeedQuery {
  bucketKey: string; // recorded in raw_tmdb_movies.seed_buckets
  label: string; // probe/report display only
  sort: string;
  params: Record<string, string>;
  take: number;
}

const SEED_BUCKETS: SeedQuery[] = [
  // Infamous: many people saw it and disliked it. The vote floor is what makes
  // it "infamous" rather than "obscure and badly rated by three people" —
  // vote_average.asc unfloored is the classic TMDB footgun in reverse.
  {
    bucketKey: "infamous",
    label: "infamous (widely disliked)",
    sort: "vote_average.asc",
    params: { "vote_count.gte": "500" },
    take: 500,
  },
  // Hidden gems: almost nobody saw it, the few who did loved it.
  {
    bucketKey: "underseen",
    label: "underseen (hidden gems)",
    sort: "vote_average.desc",
    params: { "vote_average.gte": "7.2", "vote_count.gte": "100", "vote_count.lte": "800" },
    take: 600,
  },
  // Niche favourites: a real audience found it, and they loved it. Disjoint
  // from `underseen` by construction (800 is the shared boundary) so the two
  // mean genuinely different things rather than being separated by which query
  // happened to run first.
  {
    bucketKey: "niche_loved",
    label: "niche_loved (niche favourites)",
    sort: "vote_average.desc",
    params: { "vote_average.gte": "7.2", "vote_count.gte": "800", "vote_count.lte": "2500" },
    take: 600,
  },
  // Acclaimed: highly rated AND widely seen. Measured pool at these floors is
  // 1007, so this take is essentially the whole population.
  {
    bucketKey: "acclaimed",
    label: "acclaimed (canon proxy)",
    sort: "vote_average.desc",
    params: { "vote_average.gte": "7.2", "vote_count.gte": "2000" },
    take: 1000,
  },
  // Famous: most-seen, regardless of whether it's any good. Pool is 1884, so
  // the take is the entire high-engagement population rather than a curated
  // top-N — that's intended for a recognition corpus.
  {
    bucketKey: "famous",
    label: "famous (most seen)",
    sort: "vote_count.desc",
    params: { "vote_count.gte": "3000" },
    take: 2000,
  },
  // Buzzing: trending now, before votes have accumulated. The vote CEILING is
  // the whole point — it structurally prevents this bucket from re-grabbing the
  // blockbusters `famous` already has, which is what made an earlier
  // popularity.desc bucket only 28% unique. Skews recent by design, and unlike
  // every other bucket it re-ranks daily, which is why the snapshot is pinned.
  {
    bucketKey: "buzzing",
    label: "buzzing (trending now)",
    sort: "popularity.desc",
    params: { "vote_count.gte": "1000", "vote_count.lte": "4000" },
    take: 500,
  },
];

// Era: the most-voted films of each decade, as a backfill for the fact that
// every other bucket gates on vote counts and vote counts track who's streaming
// things NOW. Casablanca has a fraction of a mid-tier 2023 release's votes, so
// without this the seed is ~80% post-1990.
//
// Two floors because a flat one can't work across 80 years: 300 votes in the
// 2010s is nothing, while 300 in the 1950s excludes nearly the entire decade.
//
// Unlike the earlier draft this UNIONs rather than taking unclaimed-only. The
// self-targeting that made unclaimed-only elegant (thin decades fill up, full
// decades add nothing) still happens — it just happens at label time in the
// adapter, where precedence decides that a 2010s blockbuster reads as 'famous'
// rather than 'era'. At fetch time the overlap is free: dedupe absorbs it.
const ERA_FIRST_DECADE = 1950;
const ERA_LAST_DECADE = 2020;
const ERA_MODERN_FROM = 1980;
const ERA_VOTE_FLOOR_MODERN = 300;
const ERA_VOTE_FLOOR_CLASSIC = 100;
const ERA_TAKE_PER_DECADE = 100;

function eraQueries(): SeedQuery[] {
  const out: SeedQuery[] = [];
  for (let decade = ERA_FIRST_DECADE; decade <= ERA_LAST_DECADE; decade += 10) {
    const floor = decade >= ERA_MODERN_FROM ? ERA_VOTE_FLOOR_MODERN : ERA_VOTE_FLOOR_CLASSIC;
    out.push({
      bucketKey: "era",
      label: `era ${decade}s (floor ${floor})`,
      sort: "vote_count.desc",
      params: {
        "primary_release_date.gte": `${decade}-01-01`,
        "primary_release_date.lte": `${decade + 9}-12-31`,
        "vote_count.gte": String(floor),
      },
      take: ERA_TAKE_PER_DECADE,
    });
  }
  return out;
}

// A director's "qualifying filmography" = films they're credited as Director
// on that clear EXPANSION_VOTE_FLOOR. Both gates below run against that one
// set, so the rule stays self-consistent: a director is kept if they have
// >= 5 films people have actually seen, and we then take their 15 most-seen.
//
// Gating on qualifying films rather than raw career credit count matters —
// TMDB's person credits include shorts, documentaries and direct-to-video
// work, so a raw ">= 5 directed" gate would pass someone with 3 features and
// 4 obscure shorts. The cap matters for the opposite reason: prolific
// directors (Miike ~110 films, Ford ~140) would otherwise each drag in dozens
// of marginal titles, which is exactly the obscurity the corpus is avoiding.
const DIRECTOR_MIN_QUALIFYING_FILMS = 5;
const DIRECTOR_FILM_CAP = 15;
const EXPANSION_VOTE_FLOOR = 100;

// One request per film gets details + keywords + the complete cast/crew +
// every region's watch providers. The sub-resources come back in the same
// response either way, so this is 1 request instead of 4 with no downside.
// release_dates added 2026-07-24 for the certifications layer (adapter part 5);
// the pre-existing corpus was backfilled the same day, so payloads are uniform.
const APPEND_TO_RESPONSE = "keywords,credits,watch/providers,release_dates";

const TMDB_API = "https://api.themoviedb.org/3";
const DISCOVER_PAGE_SIZE = 20; // TMDB's fixed page size — not configurable
const DISCOVER_MAX_PAGE = 500; // hard cap; page 501+ errors. 10k results ceiling.

// TMDB throttles around ~50 req/s and this run makes several thousand
// requests, so some concurrency is necessary to finish in minutes rather than
// an hour. 12 leaves comfortable headroom under the throttle; 429s are still
// retried with backoff regardless, since the limit isn't formally documented.
const CONCURRENCY = 12;
const MAX_RETRIES = 5;
const FETCH_TIMEOUT_MS = 30_000;

// Smaller than import-anilist.ts's 500: these rows carry a full movie payload
// (tens of KB each, blockbusters with large casts more), so a 500-row batch
// would be a multi-MB request body.
const UPSERT_CHUNK_SIZE = 100;

// ── TMDB response shapes ────────────────────────────────────────────────
// Only the fields this script actually reads are typed. The payload is stored
// whole regardless, so this is not an attempt to model TMDB's full schema —
// doing that is exactly what the raw jsonb layer exists to avoid.

interface DiscoverMovie {
  id: number;
  title: string;
  vote_average: number;
  vote_count: number;
  release_date: string | null;
  original_language: string | null;
  popularity: number;
}

interface DiscoverPage {
  page: number;
  results: DiscoverMovie[];
  total_pages: number;
  total_results: number;
}

// A crew entry on /person/{id}/movie_credits is a full movie object with the
// credit's job/department attached — so one request per director yields the
// qualifying-film gate, the film list, and their vote counts together. There's
// no need to hit Discover during expansion at all.
interface PersonCrewCredit {
  id: number;
  title: string;
  job: string;
  department: string;
  vote_count: number;
  vote_average: number;
  release_date: string | null;
  adult: boolean;
  popularity: number;
}

interface PersonMovieCredits {
  id: number;
  crew: PersonCrewCredit[];
}

interface MovieCrew {
  id: number;
  name: string;
  job: string;
  department: string;
}

interface MoviePayload {
  id: number;
  title: string;
  release_date: string | null;
  original_language: string | null;
  vote_count: number;
  vote_average: number;
  genres: { id: number; name: string }[] | null;
  production_companies: { id: number; name: string }[] | null;
  keywords: { keywords: { id: number; name: string }[] } | null;
  credits: { cast: { id: number; name: string; order: number }[]; crew: MovieCrew[] } | null;
}

interface ExclusionRow {
  tmdb_id: number | null;
  person_id: number | null;
  stage: "seed" | "expand" | "hydrate";
  reason: string;
  detail: Record<string, unknown> | null;
}

// ── helpers ─────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Fixed-size worker pool. Preserves input order in the output (workers write
// to their own index), so callers can zip results back against their inputs.
async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

let accessToken = "";

// Returns null on a 404 rather than throwing: TMDB's id space legitimately
// contains ids that resolve for a person's credits but 404 on fetch (deleted
// or merged entries). One bad id shouldn't abort a several-thousand-request
// run — the caller logs it as a hydrate exclusion and moves on.
async function tmdbFetch<T>(path: string): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${TMDB_API}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      // Network error / timeout. Retry with backoff — at this request volume
      // a transient failure is near certain at least once per run.
      if (attempt === MAX_RETRIES) throw new Error(`TMDB request failed for ${path}: ${String(err)}`);
      await sleep(1000 * attempt);
      continue;
    }

    if (res.status === 404) return null;

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2;
      await sleep(retryAfter * 1000);
      continue;
    }

    if (res.status >= 500) {
      if (attempt === MAX_RETRIES) throw new Error(`TMDB ${res.status} for ${path} after ${MAX_RETRIES} attempts`);
      await sleep(1000 * attempt);
      continue;
    }

    if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}: ${res.statusText}`);
    return (await res.json()) as T;
  }
  throw new Error(`Gave up on ${path} after ${MAX_RETRIES} attempts`);
}

function discoverPath(query: SeedQuery, page: number): string {
  const qs = new URLSearchParams({
    include_adult: "false",
    sort_by: query.sort,
    ...query.params,
    page: String(page),
  });
  return `/discover/movie?${qs}`;
}

function decadeOf(releaseDate: string | null): string {
  if (!releaseDate || releaseDate.length < 4) return "unknown";
  const year = Number(releaseDate.slice(0, 4));
  if (!Number.isFinite(year)) return "unknown";
  return `${Math.floor(year / 10) * 10}s`;
}

// Renders a count map as an aligned bar chart. The seed report is the actual
// deliverable of this step — a decade skew or a language monoculture is
// obvious in a histogram and invisible in a list of several thousand films.
function histogram(counts: Map<string, number>, opts: { sortByKey?: boolean; top?: number } = {}) {
  let entries = [...counts.entries()];
  entries = opts.sortByKey ? entries.sort((a, b) => a[0].localeCompare(b[0])) : entries.sort((a, b) => b[1] - a[1]);
  if (opts.top) entries = entries.slice(0, opts.top);
  const max = Math.max(...entries.map(([, n]) => n), 1);
  const keyWidth = Math.max(...entries.map(([k]) => k.length), 1);
  for (const [key, n] of entries) {
    const bar = "█".repeat(Math.max(1, Math.round((n / max) * 42)));
    console.log(`    ${key.padEnd(keyWidth)}  ${String(n).padStart(5)}  ${bar}`);
  }
}

// ── main ────────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!supabaseUrl || !secretKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY environment variables.");
  }
  if (!token) throw new Error("Missing TMDB_ACCESS_TOKEN environment variable.");
  accessToken = token;

  const supabase = createClient(supabaseUrl, secretKey);
  const startedAt = Date.now();
  const exclusions: ExclusionRow[] = [];
  let requestCount = 0;

  // ── preflight ─────────────────────────────────────────────────────────
  // The landing write is the LAST thing this script does — several thousand
  // TMDB requests and ~7 minutes in — so any permissions or schema problem
  // there costs the entire run. That is not hypothetical: the first run
  // fetched all 6,564 films and then died on "permission denied", because
  // 0009 created the tables but the base service_role GRANT didn't arrive
  // until 0010 (the same grant-vs-RLS trap 0002 and 0003 already documented
  // for the catalog tables). A round-trip write costs two requests and fails
  // in seconds instead.
  const probeId = -1; // outside TMDB's id space, so it can never collide with real data
  const probe = await supabase
    .from("raw_tmdb_movies")
    .upsert({ tmdb_id: probeId, payload: {}, fetched_at: new Date().toISOString() }, { onConflict: "tmdb_id" });
  if (probe.error) throw new Error(`Preflight write to raw_tmdb_movies failed: ${probe.error.message}`);
  await supabase.from("raw_tmdb_movies").delete().eq("tmdb_id", probeId);

  const probeExclusion = await supabase
    .from("tmdb_ingest_exclusions")
    .insert({ tmdb_id: probeId, person_id: null, stage: "seed", reason: "preflight_probe", detail: null });
  if (probeExclusion.error) {
    throw new Error(`Preflight write to tmdb_ingest_exclusions failed: ${probeExclusion.error.message}`);
  }
  await supabase.from("tmdb_ingest_exclusions").delete().eq("reason", "preflight_probe");

  // ── phase 1: size probe ───────────────────────────────────────────────
  // Every take is provisional: TMDB's pools are much smaller than they look,
  // and a take that exceeds its pool silently under-fills rather than
  // erroring. Page 1 of each query carries total_results, so one request per
  // query (14 total) turns every take into min(target, pool) BEFORE the run
  // commits to anything — and prints the gap, so a bucket that can no longer
  // fill its target is visible rather than quietly shrinking.
  console.log("── SIZE PROBE ───────────────────────────────────────────\n");

  const queries = [...SEED_BUCKETS, ...eraQueries()];

  const probes = await pool(queries, CONCURRENCY, async (query) => {
    requestCount++;
    const page = await tmdbFetch<DiscoverPage>(discoverPath(query, 1));
    return { query, poolSize: page?.total_results ?? 0 };
  });

  for (const { query, poolSize } of probes) {
    const take = Math.min(query.take, poolSize);
    const short = take < query.take ? `  ← pool short of ${query.take}` : "";
    console.log(`  ${query.label.padEnd(32)} take ${String(take).padStart(4)} / pool ${String(poolSize).padStart(6)}${short}`);
  }

  // ── phase 2: seed ─────────────────────────────────────────────────────
  // Buckets UNION. A film found by several records all of them; nothing is
  // dropped for being a "duplicate" and no bucket claims exclusivity.
  console.log("\n── SEED ─────────────────────────────────────────────────\n");

  const seedBuckets = new Map<number, Set<string>>(); // tmdb id -> every bucket that found it
  const bucketRawCounts = new Map<string, number>();

  for (const { query, poolSize } of probes) {
    const take = Math.min(query.take, poolSize);
    if (take === 0) {
      console.log(`  ${query.label.padEnd(32)} skipped — empty pool`);
      continue;
    }

    const pageCount = Math.min(Math.ceil(take / DISCOVER_PAGE_SIZE), DISCOVER_MAX_PAGE);
    const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1);

    const pages = await pool(pageNumbers, CONCURRENCY, async (page) => {
      requestCount++;
      return tmdbFetch<DiscoverPage>(discoverPath(query, page));
    });

    // Dedupe within the query before slicing: a Discover query sorted on a
    // field that re-ranks mid-pagination (popularity, and vote_count for very
    // recent films) can return the same film on two pages, which would
    // otherwise eat a slot in the take.
    const seenInQuery = new Set<number>();
    const films: DiscoverMovie[] = [];
    for (const film of pages.flatMap((p) => p?.results ?? [])) {
      if (seenInQuery.has(film.id)) continue;
      seenInQuery.add(film.id);
      films.push(film);
      if (films.length >= take) break;
    }

    bucketRawCounts.set(query.bucketKey, (bucketRawCounts.get(query.bucketKey) ?? 0) + films.length);

    let fresh = 0;
    for (const film of films) {
      const existing = seedBuckets.get(film.id);
      if (existing) existing.add(query.bucketKey);
      else {
        seedBuckets.set(film.id, new Set([query.bucketKey]));
        fresh++;
      }
    }

    console.log(
      `  ${query.label.padEnd(32)} took ${String(films.length).padStart(4)}  ${String(fresh).padStart(4)} new`,
    );
  }

  const seedIds = [...seedBuckets.keys()];
  const seedGross = [...bucketRawCounts.values()].reduce((a, b) => a + b, 0);
  console.log(`\n  ${seedGross} gross → ${seedIds.length} unique after dedupe (${seedGross - seedIds.length} cross-bucket overlaps)\n`);

  // ── phase 3: hydrate the seed ─────────────────────────────────────────
  // Has to happen before expansion: directors are only knowable from each
  // film's credits, which only the full payload carries.
  console.log("── HYDRATE SEED ─────────────────────────────────────────\n");

  const payloads = new Map<number, MoviePayload>();

  async function hydrate(ids: number[], label: string) {
    let done = 0;
    const fetched = await pool(ids, CONCURRENCY, async (id) => {
      requestCount++;
      const payload = await tmdbFetch<MoviePayload>(`/movie/${id}?append_to_response=${APPEND_TO_RESPONSE}`);
      done++;
      if (done % 250 === 0) console.log(`  ${label}: ${done}/${ids.length}`);
      return { id, payload };
    });
    for (const { id, payload } of fetched) {
      if (payload) payloads.set(id, payload);
      else exclusions.push({ tmdb_id: id, person_id: null, stage: "hydrate", reason: "fetch_404", detail: null });
    }
  }

  await hydrate(seedIds, "seed");
  console.log(`  hydrated ${payloads.size}/${seedIds.length} seed films\n`);

  // ── phase 4: collect directors ────────────────────────────────────────
  console.log("── DIRECTORS ────────────────────────────────────────────\n");

  const directorIds = new Set<number>();
  for (const payload of payloads.values()) {
    for (const crew of payload.credits?.crew ?? []) {
      if (crew.job === "Director") directorIds.add(crew.id);
    }
  }
  console.log(`  ${directorIds.size} unique directors across the seed`);

  // ── phase 5: expand ───────────────────────────────────────────────────
  const viaDirectors = new Map<number, Set<number>>(); // film id -> directors that pulled it
  const keptDirectorIds = new Set<number>();
  let doneDirectors = 0;

  const directorList = [...directorIds];
  const directorResults = await pool(directorList, CONCURRENCY, async (personId) => {
    requestCount++;
    const credits = await tmdbFetch<PersonMovieCredits>(`/person/${personId}/movie_credits`);
    doneDirectors++;
    if (doneDirectors % 250 === 0) console.log(`  fetched ${doneDirectors}/${directorList.length} filmographies`);
    return { personId, credits };
  });

  for (const { personId, credits } of directorResults) {
    if (!credits) {
      exclusions.push({ tmdb_id: null, person_id: personId, stage: "expand", reason: "person_fetch_404", detail: null });
      continue;
    }

    // Dedupe by film id first: a person can carry two Director credits on one
    // film (e.g. co-credited under separate credit_ids), which would otherwise
    // count twice toward the >= 5 gate and consume two of their 15 slots.
    const directed = new Map<number, PersonCrewCredit>();
    for (const c of credits.crew) {
      if (c.job !== "Director") continue;
      if (!directed.has(c.id)) directed.set(c.id, c);
    }

    const qualifying: PersonCrewCredit[] = [];
    for (const film of directed.values()) {
      // Discover applied include_adult=false for us, but person credits have
      // no such parameter — so the adult filter has to be applied by hand here
      // or expansion would quietly reintroduce what the seed excluded.
      if (film.adult) {
        exclusions.push({
          tmdb_id: film.id,
          person_id: personId,
          stage: "expand",
          reason: "adult",
          detail: { title: film.title },
        });
        continue;
      }
      if (film.vote_count < EXPANSION_VOTE_FLOOR) {
        exclusions.push({
          tmdb_id: film.id,
          person_id: personId,
          stage: "expand",
          reason: "below_vote_floor",
          detail: { title: film.title, vote_count: film.vote_count },
        });
        continue;
      }
      qualifying.push(film);
    }

    if (qualifying.length < DIRECTOR_MIN_QUALIFYING_FILMS) {
      exclusions.push({
        tmdb_id: null,
        person_id: personId,
        stage: "expand",
        reason: "director_below_min_films",
        detail: { qualifying_films: qualifying.length },
      });
      continue;
    }

    keptDirectorIds.add(personId);
    const ranked = qualifying.sort((a, b) => b.vote_count - a.vote_count);
    for (const film of ranked.slice(DIRECTOR_FILM_CAP)) {
      exclusions.push({
        tmdb_id: film.id,
        person_id: personId,
        stage: "expand",
        reason: "over_director_cap",
        detail: { title: film.title, vote_count: film.vote_count },
      });
    }
    for (const film of ranked.slice(0, DIRECTOR_FILM_CAP)) {
      const existing = viaDirectors.get(film.id);
      if (existing) existing.add(personId);
      else viaDirectors.set(film.id, new Set([personId]));
    }
  }

  const expansionIds = [...viaDirectors.keys()].filter((id) => !seedBuckets.has(id));
  console.log(
    `  ${keptDirectorIds.size} directors passed (>= ${DIRECTOR_MIN_QUALIFYING_FILMS} films above ${EXPANSION_VOTE_FLOOR} votes), ` +
      `${directorIds.size - keptDirectorIds.size} rejected`,
  );
  console.log(`  ${expansionIds.length} new films after removing those already in the seed\n`);

  // ── phase 6: hydrate the expansion ────────────────────────────────────
  console.log("── HYDRATE EXPANSION ────────────────────────────────────\n");
  await hydrate(expansionIds, "expansion");
  console.log(`  ${payloads.size} films hydrated in total\n`);

  // ── phase 7: land the raw payloads ────────────────────────────────────
  console.log("── LANDING ──────────────────────────────────────────────\n");

  const fetchedAt = new Date().toISOString();
  const rows = [...payloads.entries()].map(([tmdbId, payload]) => ({
    tmdb_id: tmdbId,
    payload,
    seed_buckets: [...(seedBuckets.get(tmdbId) ?? [])],
    via_director_ids: [...(viaDirectors.get(tmdbId) ?? [])],
    fetched_at: fetchedAt,
  }));

  // Reset this run's own annotations across the WHOLE table before landing —
  // but never the payloads.
  //
  // seed_buckets/via_director_ids are our bookkeeping about the CURRENT seed
  // rules, not raw TMDB data, so they go stale the moment those rules change.
  // A film the previous snapshot tagged 'popular'/'loved'/'most_voted' (buckets
  // that no longer exist) would otherwise keep those keys forever if the new
  // seed doesn't re-find it, leaving the adapter reading two incompatible
  // vocabularies out of one column. The upsert below can't fix that on its own
  // — it only touches rows this run actually found.
  //
  // Clearing first and letting the run repopulate means a row ending up with
  // BOTH arrays empty is meaningful rather than ambiguous: it's a film from an
  // earlier snapshot that the current rules no longer select. That's reported
  // as an orphan rather than deleted — the payload cost several thousand
  // requests to fetch and is still perfectly good raw data. Deciding whether
  // orphans belong in the catalog is an adapter question.
  const { error: resetError } = await supabase
    .from("raw_tmdb_movies")
    .update({ seed_buckets: [], via_director_ids: [] })
    .neq("tmdb_id", 0); // no-op predicate; PostgREST requires a filter on update
  if (resetError) throw new Error(`Resetting seed annotations failed: ${resetError.message}`);

  let landed = 0;
  for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from("raw_tmdb_movies").upsert(batch, { onConflict: "tmdb_id" });
    if (error) throw new Error(`raw_tmdb_movies upsert failed: ${error.message}`);
    landed += batch.length;
    if (landed % 500 === 0) console.log(`  landed ${landed}/${rows.length}`);
  }
  console.log(`  landed ${landed} films`);

  const { count: orphanCount, error: orphanError } = await supabase
    .from("raw_tmdb_movies")
    .select("tmdb_id", { count: "exact", head: true })
    .eq("seed_buckets", "{}")
    .eq("via_director_ids", "{}");
  if (orphanError) throw new Error(`Counting orphans failed: ${orphanError.message}`);
  if (orphanCount) {
    console.log(`  ${orphanCount} orphans from a previous snapshot (payload kept, no longer selected by the current rules)`);
  }

  // Truncate-then-insert rather than upsert: these rows describe THIS run's
  // decisions, and a stale rejection from a previous run with different
  // thresholds would silently corrupt the "what did the floor kill?" answer
  // this table exists to give.
  const { error: clearError } = await supabase.from("tmdb_ingest_exclusions").delete().neq("stage", "");
  if (clearError) throw new Error(`Clearing exclusions failed: ${clearError.message}`);
  let loggedExclusions = 0;
  for (const batch of chunk(exclusions, 500)) {
    const { error } = await supabase.from("tmdb_ingest_exclusions").insert(batch);
    if (error) throw new Error(`tmdb_ingest_exclusions insert failed: ${error.message}`);
    loggedExclusions += batch.length;
  }
  console.log(`  logged ${loggedExclusions} exclusions\n`);

  // ── phase 8: report ───────────────────────────────────────────────────
  // The rows are just what this is computed from — this report is the thing
  // that answers "do the seed rules need changing?".
  console.log("═══ SEED REPORT ═════════════════════════════════════════\n");

  const seedOnly = seedIds.filter((id) => payloads.has(id));

  console.log("  Bucket overlap (how many of each bucket's films the other buckets also found)");
  // Distinct keys, in declared order. Not SEED_BUCKETS.map — 'era' is eight
  // separate Discover queries sharing one bucket key, so mapping the query
  // list would repeat it eight times across the matrix.
  const bucketKeys = [...new Set(queries.map((q) => q.bucketKey))];
  const header = "".padEnd(12) + bucketKeys.map((k) => k.slice(0, 10).padStart(11)).join("");
  console.log(`  ${header}`);
  for (const a of bucketKeys) {
    const cells = bucketKeys.map((b) => {
      const n = seedOnly.filter((id) => {
        const s = seedBuckets.get(id);
        return s?.has(a) && s?.has(b);
      }).length;
      return String(n).padStart(11);
    });
    console.log(`  ${a.padEnd(12)}${cells.join("")}`);
  }

  const exclusiveCounts = new Map<string, number>();
  for (const id of seedOnly) {
    const s = seedBuckets.get(id);
    if (s && s.size === 1) exclusiveCounts.set([...s][0], (exclusiveCounts.get([...s][0]) ?? 0) + 1);
  }
  console.log("\n  Films found by ONE bucket only (what each bucket uniquely contributes)");
  histogram(exclusiveCounts);

  console.log("\n  Decade — whole corpus");
  const decades = new Map<string, number>();
  for (const p of payloads.values()) {
    const d = decadeOf(p.release_date);
    decades.set(d, (decades.get(d) ?? 0) + 1);
  }
  histogram(decades, { sortByKey: true });

  for (const bucketKey of bucketKeys) {
    const counts = new Map<string, number>();
    for (const id of seedOnly) {
      if (!seedBuckets.get(id)?.has(bucketKey)) continue;
      const d = decadeOf(payloads.get(id)!.release_date);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    console.log(`\n  Decade — '${bucketKey}' bucket`);
    histogram(counts, { sortByKey: true });
  }

  console.log("\n  Decade — expansion only (what rounding out careers added)");
  const expansionDecades = new Map<string, number>();
  for (const id of expansionIds) {
    const p = payloads.get(id);
    if (!p) continue;
    const d = decadeOf(p.release_date);
    expansionDecades.set(d, (expansionDecades.get(d) ?? 0) + 1);
  }
  histogram(expansionDecades, { sortByKey: true });

  console.log("\n  Original language (top 12)");
  const languages = new Map<string, number>();
  for (const p of payloads.values()) {
    const l = p.original_language ?? "unknown";
    languages.set(l, (languages.get(l) ?? 0) + 1);
  }
  histogram(languages, { top: 12 });

  // THREE populations, not two. Only directors found on a SEED film were ever
  // candidates — they're the ones the >= 5 gate ran against. Directors who
  // appear solely on EXPANSION films arrived as a side effect of someone
  // else's filmography and were never evaluated at all, so folding them in
  // with the genuinely rejected overstates the gate's reach: on the first run
  // that inflated "rejected" from 1,375 to 1,700 and made a third of it a
  // fiction.
  //
  // The distinction is exactly directorIds (evaluated) vs keptDirectorIds
  // (passed); everything else in the credits is a bystander.
  const filmsPerDirector = new Map<number, number>();
  for (const p of payloads.values()) {
    for (const crew of p.credits?.crew ?? []) {
      if (crew.job === "Director") filmsPerDirector.set(crew.id, (filmsPerDirector.get(crew.id) ?? 0) + 1);
    }
  }

  const keptBands = new Map<string, number>();
  const rejectedBands = new Map<string, number>();
  const notEvaluatedBands = new Map<string, number>();
  let rejectedTotal = 0;
  let notEvaluatedTotal = 0;

  for (const [personId, n] of filmsPerDirector) {
    const band =
      n === 1 ? "1 film" : n === 2 ? "2" : n <= 4 ? "3-4" : n <= 9 ? "5-9" : n <= 14 ? "10-14" : `${DIRECTOR_FILM_CAP}+ (capped)`;
    let target: Map<string, number>;
    if (keptDirectorIds.has(personId)) {
      target = keptBands;
    } else if (directorIds.has(personId)) {
      target = rejectedBands;
      rejectedTotal++;
    } else {
      target = notEvaluatedBands;
      notEvaluatedTotal++;
    }
    target.set(band, (target.get(band) ?? 0) + 1);
  }

  console.log(`\n  Films per director — KEPT (${keptDirectorIds.size}: passed the gate, filmography expanded)`);
  histogram(keptBands);
  console.log(`\n  Films per director — REJECTED (${rejectedTotal}: on a seed film, below the ${DIRECTOR_MIN_QUALIFYING_FILMS}-film gate)`);
  histogram(rejectedBands);
  console.log(`\n  Films per director — NOT EVALUATED (${notEvaluatedTotal}: only on expansion films, never a candidate)`);
  histogram(notEvaluatedBands);

  // Keyword frequency is the number every future weighting decision depends
  // on, and the head/tail split is where the film side's real design problem
  // lives — the most FREQUENT keywords are the least USEFUL ones ('based on
  // novel' matches everything), so a naive popularity sort would surface the
  // worst tags first.
  console.log("\n  Keywords — most frequent (the head: high frequency, low discriminating power)");
  const keywordFreq = new Map<string, number>();
  for (const p of payloads.values()) {
    for (const k of p.keywords?.keywords ?? []) {
      keywordFreq.set(k.name, (keywordFreq.get(k.name) ?? 0) + 1);
    }
  }
  histogram(keywordFreq, { top: 20 });

  const freqValues = [...keywordFreq.values()];
  const singletons = freqValues.filter((n) => n === 1).length;
  const usable = freqValues.filter((n) => n >= 3).length;
  console.log(`\n    ${keywordFreq.size} unique keywords`);
  console.log(`    ${singletons} appear on exactly 1 film (${Math.round((singletons / keywordFreq.size) * 100)}% — unusable as filters)`);
  console.log(`    ${usable} appear on 3+ films (the plausible starting vocabulary)`);

  console.log("\n  Genres");
  const genreFreq = new Map<string, number>();
  for (const p of payloads.values()) {
    for (const g of p.genres ?? []) genreFreq.set(g.name, (genreFreq.get(g.name) ?? 0) + 1);
  }
  histogram(genreFreq);

  console.log("\n  Exclusions by reason");
  const exclusionReasons = new Map<string, number>();
  for (const e of exclusions) {
    const key = `${e.stage}/${e.reason}`;
    exclusionReasons.set(key, (exclusionReasons.get(key) ?? 0) + 1);
  }
  histogram(exclusionReasons);

  const payloadBytes = rows.reduce((sum, r) => sum + JSON.stringify(r.payload).length, 0);
  console.log(`\n  Corpus: ${payloads.size} films  ·  ${seedOnly.length} seed + ${expansionIds.length} expansion`);
  console.log(`  Raw payload size: ~${(payloadBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  ${requestCount.toLocaleString()} TMDB requests in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  console.log(`  Snapshot pinned at ${fetchedAt}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
