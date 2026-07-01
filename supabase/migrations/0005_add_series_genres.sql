-- Adds AniList's Media.genres (top-level field, plain [String] — no
-- per-pairing metadata the way tags have `rank`).
--
-- text[] rather than a series_genres join table: genres have nothing
-- resembling `rank` to hang off a join row, and are a small, closed,
-- AniList-controlled vocabulary (~19-20 values total) rather than an open
-- growing folksonomy like tags (276 and counting) — the "normalize to
-- protect against drift in a large vocabulary" argument that justified
-- tags/series_tags doesn't apply here, since genre values are only ever
-- written verbatim from AniList's API, never free-typed. Postgres arrays
-- are a first-class fit and can take a GIN index later if genre-filter
-- queries ever need it at scale — not needed yet at ~500 rows.
--
-- not null default '{}' (unlike tags.category's plain nullable) — "no
-- genres yet" is more naturally an empty array than a null one; keeps every
-- consumer from needing a `?? []` fallback.
--
-- No RLS/grant changes needed, same reasoning as 0004.

alter table public.series add column genres text[] not null default '{}';
