# Server-side recommend for the film side

Status: shipped 2026-10-28 (same day; see Result below). Migration 0013
applied to the linked project.

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

## Result (2026-10-28)

Shipped as proposed, with three departures noted below.

| Prerendered file          | Before (wire v1) | After          |
| ------------------------- | ---------------- | -------------- |
| `.next/server/app/film.html` | 8.6 MB           | 1.20 MB (241 KB gzip) |
| `.next/server/app/film.rsc`  | 8.0 MB           | 1.01 MB (220 KB gzip) |
| `.next/server/app/anime.html` | 0.76 MB          | 0.74 MB        |

What is on the film page now: the 15,196 tags (People included, 13k of
them) packed as tuples with a shared category table (`packTags`, wire v2),
and the film count. No series. The first roll's five cards arrive from
`/api/pool` (`recommend_films`, migration 0013), prefetched the moment a
tag is placed.

**Verification.** A one-off script fetched the full catalog with
`getFilmCatalog()`, drew 25 random mixes (1–3 ids across tag/genre/synth
kinds, min 1–3, up to 4 exclusions, 3 of them deliberately qualifying),
and compared: the function's `total` equalled the client's
`scorePool(...).length` on 25/25 (totals from 0 to 4,696), every sampled id
was in the client pool, and every sampled row's `tag_keys` reproduced the
client's `tmdb-tag:` memberships exactly. Round trip from the script:
145–610 ms per call. Live on `npm run dev`: smoke and lockflow scenarios
pass on `/film`; a swap replaced one card with an off-screen title; a second
roll served five titles none of which were on screen; one `/api/pool`
request per key change (4 for Random → roll → swap → roll).

**Departures from the proposal.**

- `tagInfos` is not in the response: the page still ships every tag
  (People included) because the pool UI, Random, and the card tag rows all
  read `tagInfoById` synchronously. Packing tags as tuples (wire v2) made
  that cheap enough (2.0 MB → ~0.9 MB of the page) that lazy People tags
  became a separate decision rather than a prerequisite.
- The function returns `total` on every row plus the film columns and a
  `tag_keys text[]`, not `(total, films jsonb)`: PostgREST then hands
  supabase-js typed rows that go through the same `adaptFilmRow` the page
  query uses, so there is one adapter, not a JSON twin of it.
- Query params are repeated (`tags=a&tags=b`), not comma-joined: two
  keyword ids contain commas ("kw:based on song, poem or rhyme"), found by
  the cross-check script's comma scan.

**Learnings.**

- Scoring parity needed one pre-aggregation (hits over `film_tag_links`
  for the selected keys only, on the 0012 `tag_id` index) plus
  null-safe column checks (`exists`, `count(distinct …)`), and matched on
  the first run. The two things that would have silently diverged were
  the trailing-space certification and a duplicate genre in an array —
  both are handled by a shared `synthValues()` on the client and mirrored
  in the SQL comment, so the next column-derived tag has a checklist.
- `canSwap` reads the LATEST pool even while the next key is in flight;
  otherwise the swap affordance flickers off after every roll. The swap
  itself still requires an exact key match, so a stale yes is a no-op
  click, never a wrong card.
- The reducer stayed pure: a pool miss returns the state unchanged, and
  `actions.recommend()`'s synchronous error return keeps working because
  the pool lives in state and is read through `stateRef`.
- `getFilmTags()` (no links join) made `/film`'s build-time fetch a flat
  read of six small columns; the full `getFilmCatalog()` stays for scripts
  and the cross-check.

**Open.** Lazy People tags (fetch on People section open / search) would
take the page to ~0.3 MB; the anime side could move to the same pool
interface with a local provider so the reducer has one code path — both
are now independent decisions, neither is blocking.
