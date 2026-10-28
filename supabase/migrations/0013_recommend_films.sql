-- Server-side recommend for the film side (docs/proposals/server-side-
-- recommend.md). /film used to prerender the whole partition as client
-- props (8.6 MB after the wire format) so the reducer could score it in the
-- browser; the reducer only ever needs "how many films qualify for THIS mix
-- minus what is on screen", and five of them. This function answers exactly
-- that, so the page can ship tags only.
--
-- The scoring expression MUST equal scoreSeries (src/lib/konomi/scoring.ts)
-- over the membership ids adaptFilmRow mints (src/lib/supabase/filmQueries.ts):
--   tmdb-tag:<film_tags.key>            via film_tag_links
--   tmdb-genre:<name>                   films.genres
--   tmdb-synth:reception:<v>            films.reception
--   tmdb-synth:decade:<v>               films.decade
--   tmdb-synth:country:<v>              films.countries
--   tmdb-synth:language:<v>             films.original_language
--   tmdb-synth:cert:<v>                 films.certification, trimmed (one raw
--                                       row carries "PG-13 ")
-- A film's score is the number of DISTINCT selected ids it carries (the
-- client dedupes a film's ids into a set; a duplicate genre in the array
-- must not count twice). The ids are parsed here by prefix rather than
-- stored, so the adapter stays the single place that defines them.
-- Verified against the client on random mixes before this landed (see the
-- proposal's Result section); keep both in step.
--
-- Only the selected tmdb-tag keys are joined (film_tag_links_tag_id_idx,
-- 0012), never the whole 177k-row links table — that join is what made the
-- page's catalog fetch slow in the first place.
--
-- `total` is repeated on every sampled row rather than returned beside a
-- jsonb blob so PostgREST hands supabase-js plain typed rows; zero rows
-- means total = 0 (the sample is drawn from the same set as the count).
-- STABLE is a promise about the tables, not the sample: random() is only
-- ever evaluated once per call here.

create or replace function public.recommend_films(
  tag_ids text[],
  min_match int,
  exclude_ids text[],
  sample_n int
)
returns table (
  total int,
  tmdb_id int,
  title text,
  year int,
  runtime int,
  rating numeric,
  genres text[],
  reception text[],
  certification text,
  original_language text,
  countries text[],
  decade text,
  saga_name text,
  overview text,
  poster_path text,
  watch_providers jsonb,
  watch_link text,
  tag_keys text[]
)
language sql
stable
security invoker
as $$
  with sel as (
    select distinct id from unnest(coalesce(tag_ids, '{}'::text[])) as id
  ),
  sel_keys as (
    select substr(id, length('tmdb-tag:') + 1) as v from sel where id like 'tmdb-tag:%'
  ),
  sel_genres as (
    select substr(id, length('tmdb-genre:') + 1) as v from sel where id like 'tmdb-genre:%'
  ),
  -- Kind is the second colon-field; the value is everything after it (a
  -- value may itself contain spaces but never a colon, so this is exact).
  sel_synth as (
    select split_part(id, ':', 2) as kind, regexp_replace(id, '^tmdb-synth:[^:]*:', '') as v
    from sel where id like 'tmdb-synth:%'
  ),
  link_hits as (
    select l.film_id, count(*)::int as n
    from public.film_tag_links l
    join public.film_tags t on t.id = l.tag_id
    where t.key in (select v from sel_keys)
    group by l.film_id
  ),
  scored as (
    select
      f.id,
      coalesce(lh.n, 0)
        + (select count(distinct g) from unnest(f.genres) as g where g in (select v from sel_genres))
        + (select count(distinct r) from unnest(f.reception) as r where r in (select v from sel_synth where kind = 'reception'))
        + (select count(distinct c) from unnest(f.countries) as c where c in (select v from sel_synth where kind = 'country'))
        + (exists (select 1 from sel_synth s where s.kind = 'decade' and s.v = f.decade))::int
        + (exists (select 1 from sel_synth s where s.kind = 'language' and s.v = f.original_language))::int
        + (exists (select 1 from sel_synth s where s.kind = 'cert' and s.v = nullif(btrim(f.certification), '')))::int
        as score
    from public.films f
    left join link_hits lh on lh.film_id = f.id
  ),
  pool as (
    select s.id
    from scored s
    join public.films f on f.id = s.id
    where s.score >= min_match
      and not (('tmdb:' || f.tmdb_id::text) = any (coalesce(exclude_ids, '{}'::text[])))
  ),
  picked as (
    select id from pool order by random() limit greatest(sample_n, 0)
  )
  select
    (select count(*) from pool)::int as total,
    f.tmdb_id,
    f.title,
    f.year,
    f.runtime,
    f.rating,
    f.genres,
    f.reception,
    f.certification,
    f.original_language,
    f.countries,
    f.decade,
    f.saga_name,
    f.overview,
    f.poster_path,
    f.watch_providers,
    f.watch_link,
    coalesce(
      (select array_agg(t.key order by t.key)
       from public.film_tag_links l
       join public.film_tags t on t.id = l.tag_id
       where l.film_id = f.id),
      '{}'::text[]
    ) as tag_keys
  from picked p
  join public.films f on f.id = p.id;
$$;

-- Read-only over publicly readable tables (RLS from 0012 still applies
-- under SECURITY INVOKER), so the anon key the route handler uses may call it.
grant execute on function public.recommend_films(text[], int, text[], int) to anon, authenticated;
