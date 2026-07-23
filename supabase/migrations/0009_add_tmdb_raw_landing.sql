-- TMDB raw landing zone — the "pull" half of the anime/film shared-catalog work.
--
-- This is deliberately NOT modeled on TMDB's shape the way 0001_init.sql is
-- modeled on AniList's. The pipeline is three layers:
--
--   raw_tmdb_movies  (this table)  -> adapter (code) -> shared catalog tables
--
-- ...and only the third layer gets a hand-designed relational schema. Landing
-- the API response as jsonb instead of a column-per-field mirror is the whole
-- point of this layer:
--
--   - Re-deciding is free. Every ingest rule that would otherwise be baked in
--     at fetch time (which crew jobs become tags, which watch-provider region
--     to keep, where the keyword frequency cutoff sits) becomes a query against
--     local rows instead of a re-crawl of several thousand films. 0001_init.sql
--     learned this the hard way in the other direction — it discards AniList's
--     isGeneralSpoiler/isMediaSpoiler/isAdult at import, and its own comment
--     admits loosening that filter later would need a full re-fetch. This table
--     exists so the TMDB side never has that problem, because the keyword
--     cutoff is expected to need many rounds of tuning against real data.
--   - It can't drift. A column-per-field mirror needs a migration every time
--     TMDB adds a field; jsonb doesn't. We don't control their schema.
--
-- Payload is the full /movie/{id}?append_to_response=keywords,credits,
-- watch/providers response — details, keywords, the COMPLETE cast+crew, and
-- watch providers for EVERY region, not just the ones the app currently wants.
-- Storing the parts we don't use yet is intentional and costs nothing extra:
-- the append_to_response call returns them in the same request either way, so
-- pruning at fetch time would throw away free data and buy nothing. Cinematog-
-- rapher/composer tag categories and non-US streaming regions are both plausible
-- later, and both would be a re-crawl if pruned here instead of in the adapter.
--
-- Nothing in the app reads this table. It's the service-role script's private
-- workspace; the app reads the shared catalog layer.

create table public.raw_tmdb_movies (
  tmdb_id integer primary key,
  payload jsonb not null,
  -- Which seed bucket(s) surfaced this film — 'popular' | 'loved' | 'infamous'
  -- | 'most_voted'. An ARRAY, not a single value, because the buckets overlap
  -- heavily by design (a film can be simultaneously most-voted, loved, and
  -- currently popular) and which combination hit is exactly the signal the
  -- seed's overlap matrix reports on. This doubles as the record of a
  -- cross-bucket duplicate: a second bucket hitting an existing film appends
  -- here rather than writing an exclusion row, since "Inception was found by
  -- three buckets" is a more useful fact than three near-identical "duplicate"
  -- log lines. Empty for films that arrived only via director expansion.
  seed_buckets text[] not null default '{}',
  -- TMDB person ids of the director(s) whose filmography pulled this film in.
  -- Empty for seed films. Non-empty only for expansion films, so
  -- `seed_buckets = '{}'` and `via_director_ids <> '{}'` cleanly separate the
  -- two halves of the corpus for reporting.
  via_director_ids integer[] not null default '{}',
  -- When the payload was fetched, NOT when the row was written. The seed is a
  -- deliberately pinned snapshot: one of the four buckets sorts by TMDB's
  -- `popularity`, which is recency-weighted and re-ranks daily, so the corpus
  -- is a point-in-time artifact by construction and re-running is an explicit
  -- decision rather than an idempotent no-op. This column is what makes that
  -- snapshot date knowable after the fact.
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger raw_tmdb_movies_set_updated_at
  before update on public.raw_tmdb_movies
  for each row
  execute function public.set_updated_at();

-- The report and the adapter both reach into the payload by key (genres,
-- keywords, credits.crew, release_date). GIN over the whole document keeps
-- those containment/existence lookups from degrading into a full scan of
-- several thousand fat jsonb rows.
create index raw_tmdb_movies_payload_idx on public.raw_tmdb_movies using gin (payload);

-- "Which bucket produced this?" is the seed report's main axis; array
-- containment needs GIN, not btree.
create index raw_tmdb_movies_seed_buckets_idx on public.raw_tmdb_movies using gin (seed_buckets);


-- Every title/person the pipeline looked at and did NOT keep, plus why.
--
-- A table rather than console output on purpose: the point of the seed step is
-- to run it, look at what came back, and decide whether the rules need
-- changing. That question ("how many films did the vote floor actually kill,
-- and were any of them good?") is only answerable if the rejections are
-- queryable after the run. Log lines are gone by the time the question occurs
-- to you.
--
-- Note what is NOT here: non-director crew and non-US watch providers. Those
-- were going to be filtered at fetch time and logged as exclusions, but they're
-- kept in the raw payload instead (see this migration's header) and filtered in
-- the adapter — so they're not exclusions at all now. Logging them would also
-- have meant roughly 800k rows for crew alone, one per person per film.
create table public.tmdb_ingest_exclusions (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one of these is set, depending on what was rejected: a film
  -- (tmdb_id) or a director (person_id). Not a foreign key to
  -- raw_tmdb_movies — the whole point is that these rows were NOT kept, so
  -- there's nothing to reference.
  tmdb_id integer,
  person_id integer,
  stage text not null check (stage in ('seed', 'expand', 'hydrate')),
  reason text not null,
  -- Whatever makes the row diagnosable without a re-fetch: the title, its
  -- vote_count, the director's qualifying-film count. Free-form because each
  -- reason wants different evidence, and this table is a debugging aid rather
  -- than something the app depends on.
  detail jsonb,
  created_at timestamptz not null default now()
);

-- The report groups by reason within a stage; both are low-cardinality.
create index tmdb_ingest_exclusions_stage_reason_idx
  on public.tmdb_ingest_exclusions (stage, reason);


-- RLS: unlike series/tags/series_tags (public catalog data, anon-readable),
-- BOTH tables here are internal pipeline state that nothing client-side should
-- ever read. Enabling RLS with no select policy at all denies anon and
-- authenticated by default; the import script's service-role key bypasses RLS
-- entirely, so it needs no explicit policy. Deny-by-omission is deliberate —
-- adding a public read policy here would expose several hundred megabytes of
-- unfiltered third-party payloads through the anon key.
alter table public.raw_tmdb_movies enable row level security;
alter table public.tmdb_ingest_exclusions enable row level security;
