# Server-side recommend for the film side

Status: proposed 2026-10-28. Needs: a migration on the Supabase project
(Sean's go), ~1–2 days.

## Why

`/film` prerenders the whole catalog as client props. After the wire format
(`src/lib/konomi/catalogWire.ts`, same day) that is 8.6 MB of HTML / 2.5 MB
gzipped, down from 17.6 / 3.3. What is left is irreducible on the client:
2.3 MB of descriptions, 2.0 MB of People tags (13,282 of 15,196 tags), 1.4 MB
of membership indices. Nothing on the client needs all of it at once; the
reducer only ever needs "which titles qualify for THIS mix, minus what is on
screen", and five of them.

## Shape

1. **Postgres function** `recommend_films(tag_ids text[], min_match int,
   exclude_ids text[], sample_n int)` returning `(total int, films jsonb)`.
   Membership is one scoring expression over the three places a film's ids
   live: `film_tag_links` → `film_tags.key` (`tmdb-tag:*`), the `genres`
   column (`tmdb-genre:*`), and the synthesized columns (`tmdb-synth:*`:
   reception[], decade, countries[], original_language, certification).
   Parse by prefix with `split_part`. `ORDER BY random() LIMIT sample_n`
   for the sample, a `count(*)` for the total. Granted to `anon` (read-only,
   SECURITY INVOKER, RLS still applies).
2. **Route handler** `src/app/api/pool/route.ts`: validates the query, calls
   the function, adapts rows with the same code `filmQueries.ts` uses per
   row (extract `adaptFilmRow`), and returns `{ total, sample: Series[],
   tagInfos: TagInfo[] }` where `tagInfos` are the People tags the sample
   references (so cards can render their tag rows without the client
   holding all 13k).
3. **Reducer stays synchronous.** `state.series` becomes the *pool*: a
   prefetched `{ key, total, sample }` for the current (slots, minMatch,
   shown) key. KonomiApp prefetches when slots or min-match change
   (debounced ~150 ms) and after every RECOMMEND/REPLACE_CARD (shown
   changed). `recommend()` / `replaceCard()` / `canSwap` read the pool
   instead of scoring the catalog; `"no-match"` is `total === 0` with no
   fallback, `"no-new-matches"` is `total === 0` with a fallback, exactly
   the branches they have today. The only new state is `poolPending`,
   which disables RECOMMEND for the (usually already elapsed) fetch window.
   `actions.recommend()`'s synchronous error return keeps working because
   it reads the pool from `stateRef`.
4. **Client payload after:** non-People tags (0.26 MB) + People tags fetched
   when the People section opens or a search query is typed (one request,
   cached for the session). Series: none until the first roll. Expected
   page: under 0.5 MB raw.
5. **Anime side** keeps client-side scoring (0.76 MB, fine) behind the same
   pool interface with a local provider, so the reducer has one code path.

## Risks

- The film-tag scoring expression must match `scoreSeries` exactly; the
  test is a fixture of ten films run through both and compared.
- Cold Supabase latency on the first prefetch (~100–300 ms observed for
  single queries); hidden by prefetching on tag selection.
- Random sampling in SQL on 8.5k rows is cheap; revisit if the corpus
  grows past ~100k.

## Not chosen

- In-process catalog cache in the route handler: a cold serverless start
  refetches the catalog (7.5 s measured), and the Data Cache limit rules
  out caching 14 MB.
- Lazy card details (description/streaming fetched after the roll): fixes
  2.1 MB but adds an async card-back state for a partial win.
