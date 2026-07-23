# Konomi — data sourcing & the shared catalog

How anime and film data get into Konomi, why the pipeline is shaped the way it
is, and what we measured rather than assumed.

Scope: the **pull** and **promote** layers. Visual/UI decisions live in
`DESIGN_SYSTEM.md`; hard code rules live in `AGENTS.md`.

Status as of 2026-07-21: the TMDB **pull** layer is built and stable. The film
tag pool IA and the Reception rating methodology are **designed and settled**
(§7–8) but **not yet built** — no promote/adapter code exists. **Tag
consolidation is IN PROGRESS (§9)** — `tag-rules/master.json` holds **652
canonicals / 3,108 aliases + 214 unassigned** across 24 sections. Swept: Crime,
Sub-genre, Fantasy, Creatures, Society, Politics, Love & Relationships, People,
Based-on, Format, Franchise, Place, Location, Activities, plus genre-synonym
drops. **But ~3,210 keywords at ≥3 are still unswept — roughly half the corpus**
(see §9 "Coverage reality check"). **Tone + death/emotion are next**; Period and
the long tail follow.
Everything in §10 is still open.

---

## 1. The architecture: three layers, one hand-modeled schema

```
AniList  ──┐
           ├──►  raw landing (jsonb)  ──►  adapter  ──►  shared catalog  ──►  app
TMDB     ──┘      what the API said       our rules      our shape
```

**Only the shared catalog gets a hand-designed relational schema.** The landing
layer stores the API response as `jsonb`, unmodelled.

### Why a landing layer at all

Because re-deciding must be free. Every ingest rule that would otherwise be
baked in at fetch time — which crew jobs become tags, which watch-provider
region to keep, where the keyword cutoff sits — becomes a local query instead of
a re-crawl of thousands of films.

This is not theoretical. `0001_init.sql` discards AniList's
`isGeneralSpoiler`/`isMediaSpoiler`/`isAdult` at import, and its own comment
admits that loosening that filter later would need a full re-fetch. The TMDB
side is expected to need *many* rounds of keyword-cutoff tuning, so it cannot
afford that.

### Why jsonb and not a table per API

A column-per-field mirror of TMDB is three schemas to maintain, two of which
mirror an API we don't control and that will drift under us. jsonb needs no
migration when TMDB adds a field. Postgres queries it fine.

**Corollary: keep raw wide.** `append_to_response` returns keywords, full
cast+crew, and every region's watch providers in the *same request* — pruning at
fetch time throws away free data and buys nothing. This has already paid off
twice: Composer/Cinematographer turned out to be viable tag sections (§5), and
they'd have been a re-crawl if we'd pruned crew to directors at ingest.

### What belongs where

| Concern | Layer |
|---|---|
| Which titles exist at all | pull (only thing not redoable locally) |
| Which fields come back | pull |
| What becomes a tag, and its weight | adapter |
| Label precedence (`acclaimed` vs `famous`) | adapter |
| Region/crew-job filtering | adapter |
| Derived frequencies (`seriesCount`, ranks) | promote |

### Promote-time vs read-time derived stats

`queries.ts` computes `seriesCount`/`avgRank` at **read** time for AniList, and
its comment explains why: they'd go stale the moment the catalog changed.

**That reasoning does not transfer to film, and the divergence is deliberate.**
The film corpus is a *pinned snapshot* — it only changes when we re-import — so
the staleness that justifies read-time computation cannot occur. Computing at
promote is safe there, and it matters: 17,332 keywords × 8,531 films is a very
different proposition from 276 tags × 500 series.

---

## 2. Measured API capabilities

Verified against the live APIs on 2026-07-16/17, not recalled. Several
widely-repeated secondary sources are wrong about the keyword items.

### What TMDB can and cannot rank

| Entity | Global popularity? | Per-title rank? |
|---|---|---|
| Movies | **Yes** (API + daily export) | — |
| People | **Yes** (API + daily export) | **`cast.order`** (billing position) |
| Keywords | **No** | No |
| Production companies | **No** | No |
| Genres | No | No |

Confirmed by pulling the export files directly:

```
keyword_ids            {"id":378,"name":"prison"}
production_company_ids {"id":1,"name":"Lucasfilm Ltd."}
person_ids             {"adult":false,"id":16767,"name":"Aki Kaurismäki","popularity":2.3385}
movie_ids              {"adult":false,"id":3924,"original_title":"Blondie","popularity":2.3403,...}
```

Some sources claim the keyword export carries popularity. **It does not.**

**`cast.order` is structurally identical to AniList's `tag.rank`** — a property
of the *pairing*, not the entity (Tom Cruise is order 0 in Top Gun, order 14 in
an ensemble). `series_tags.rank` models it with no schema change; invert it
(order 0 → rank 100).

Crew has `job`/`department` but **no meaningful order**, which doesn't matter —
a film has 1–2 directors, so weight 100.

### The asymmetry, in one line

**AniList hands you a ranked, curated vocabulary. TMDB hands you raw facts and
expects you to build the vocabulary.** That is the entire difference between the
two integrations.

### Hard limits

- **Discover caps at 500 pages × 20 = 10,000 results.** Page 501 errors;
  `total_pages` lies above the cap. Window by `primary_release_date` to exceed it.
- **`sort_by=vote_average.desc` unfloored is a footgun** — returns films with a
  single 10/10 vote. Always pair with `vote_count.gte`.
- **AniList**: `perPage` max 50, 90 req/min documented but currently degraded to
  30. No bulk export; pagination only.
- **`/person/{id}/movie_credits` returns full movie objects** (with `vote_count`,
  `release_date`), so one request per director yields the gate, the film list,
  and the vote counts together. Expansion needs no Discover calls.
- **`include_adult=false` is a Discover parameter only.** Person credits have no
  equivalent — expansion must filter `adult` by hand or it silently reintroduces
  what the seed excluded (this caught 57 real films).

---

## 3. The film corpus

**Snapshot `2026-07-17T09:03:54Z` — 8,531 films (3,994 seed + 4,537 expansion), 181 MB.**

Recognition-heavy by design, not exhaustive: films people have heard of, loved,
or infamously not loved.

### Seed: seven discovery axes, unioned

| Bucket | Query | Take | Pool |
|---|---|---|---|
| `infamous` | `va.asc`, `vc>=500` | 500 | 7,945 |
| `underseen` | `va>=7.2`, `vc 100–800`, `va.desc` | 600 | 2,782 |
| `niche_loved` | `va>=7.2`, `vc 800–2500`, `va.desc` | 600 | 845 |
| `acclaimed` | `va>=7.2`, `vc>=2000`, `va.desc` | 1,000 | 1,007 |
| `famous` | `vc>=3000`, `vc.desc` | 1,884 | 1,884 (all) |
| `buzzing` | `vc 1000–4000`, `popularity.desc` | 500 | 3,505 |
| `era` | per decade 1950–2029, `vc.desc`, floor 300 (≥1980) / 100 | 100/decade | — |

**Buckets are DISCOVERY, not labels.** They union and overlap freely;
`seed_buckets[]` records every bucket that found a film. Exclusivity at fetch
time buys nothing — Discover returns what it returns, dedupe already prevents
re-hydration — and forcing one label per film discards true information (Fight
Club genuinely *is* both acclaimed and famous). Label precedence is an adapter
concern where retuning is a `WHERE` clause, not 11,000 requests.

Floors are calibrated against **measured pools**. An earlier draft asked for
1,000 `acclaimed` at `va>=7.5/vc>=2500` when only 523 such films exist, and
2,000 `famous` at `vc>=4000` when the pool is 1,380. A size probe now runs every
import and turns each take into `min(target, pool)`.

`underseen` and `niche_loved` are **one concept split into two takes on
purpose** — stratified sampling. The pools are lopsided (2,782 vs 845) and
obscure films carry inflated ratings, so a single `va.desc` sort over vc
100–2500 would let the low-vote end eat the whole take.

### Expansion

Qualifying = credited `job === "Director"` AND `vote_count >= 100`.
Gate: **≥5 qualifying films**. Cap: **top 15 by vote_count**.

Gating on *qualifying* films rather than raw credit count matters — TMDB person
credits include shorts, docs and direct-to-video, so a raw "≥5 directed" gate
passes someone with 3 features and 4 obscure shorts. The cap matters in reverse:
Miike (~110 films) and Ford (~140) would each drag in dozens of marginal titles.

**Expansion is 53% of the corpus and it is what makes the decade distribution
survivable** — it contributed 75% of all pre-1980 films. Vote counts track who
streams things *now*, so every vote-gated bucket skews modern; only careers
reach back.

### Snapshot semantics

The seed is a **pinned snapshot, not an idempotent query**. `buzzing` sorts by
`popularity` (re-ranks daily) and vote counts only ever grow, so a re-run months
later selects a materially different set. `fetched_at` stamps one timestamp
across a run, which makes snapshots cleanly separable — that's how the previous
snapshot's 69 orphans were removed with one `DELETE WHERE fetched_at < …`
instead of a re-crawl.

**One import = one coherent corpus.** Don't merge snapshots.

---

## 4. Rejected alternatives (don't re-add without reading this)

### `cult` as a bucket or automated label — REJECTED

Cult is not a numeric property. The canon spans the entire rating range (The
Room va 3.5, Fight Club va 8.4), so **any vote window that catches one admits
every bad film or every blockbuster.** Measured against a proposed
`vc 2500–15000` window:

| Film | va | vc | In window? |
|---|---|---|---|
| Fight Club | 8.44 | 32,351 | **OUT** |
| Blade Runner | 7.94 | 15,119 | **OUT** (by 119 votes) |
| X-Men | 7.02 | 12,278 | **IN** |

It excludes the two most canonical cult films and admits a superhero
blockbuster. Vote counts only grow, so films drift *out* of "cult" over time.

The keyword fallback fails too: TMDB's `cult` keyword (id 6158) means films
**about cults** — Midsommar, Eyes Wide Shut, Once Upon a Time in Hollywood.
There is no cult-film-status field.

**The films are all in the corpus anyway** (The Room via `infamous`, Lebowski
via `acclaimed`, Fight Club via `famous`). Only the label is unavailable. If
wanted, it must be **hand-curated** — same precedent as `STREAMING_ALLOW_LIST`
in `import-anilist.ts` — not faked with a vote range.

### GIN index on `raw_tmdb_movies.payload` — REJECTED (0011)

205 MB indexing a 123 MB table, zero scans. Both consumers (report, adapter)
read *every* row — full scans by design. GIN earns its keep on selective
queries; this isn't one.

### Exclusive first-claim-wins buckets — REJECTED

See §3. Saves zero requests, discards true multi-label information, and moves a
tunable decision into the one layer where changing it costs a re-crawl.

### OMDb as the film source — REJECTED

No discovery endpoint. Lookup by title/IMDb ID only, no keyword vocabulary,
1k req/day. A tag-driven recommendation site cannot be built on it.

---

## 5. What's in the corpus (measured 2026-07-17)

### The metric that decides a section

Not coverage — **connectivity**: how many tags survive a frequency floor, and
what share of films still carry one.

A tag on 10% of the corpus is a *good* tag: specific, discriminating, flavorful.
A tag on **1** film is dead — not because it's obscure, but because there is no
second film to recommend. Floors exist to remove singletons, and should sit
**low** (≥2–3), not high.

> **A summary statistic will mislead you here.** "Films per person" (a mean)
> said Producer was dead at 0.97. The floor-based scan says Producer covers
> **78.4% of films with 2,026 tags at ≥3**, with Jason Blum on 81 films and
> Kevin Feige on 41. The mean was dragged down by 61% singletons and hid a
> superb head. Use floors, not means.

### Section scorecard — tags / % films covered at ≥3

| Section | tags ≥3 | films | Verdict |
|---|---|---|---|
| Genres | 19 | 100% | ship, weight 100 |
| Decades | 14 | 100% | ship, weight 100 |
| Countries | 66 | 99.8% | ship — sleeper hit |
| Keywords | 6,321 | 96.1% | ship, needs grouping |
| Actors `order<10` | 6,883 | 95.3% | ship |
| Studios | 1,978 | 92.4% | ship |
| Actors `order<5` | 3,565 | 90.5% | ship, leaner |
| Directors | 931 | 85.3% | ship |
| Editors | 1,136 | 78.7% | viable |
| **Producers** | **2,026** | **78.4%** | **ship** — Blum 81, Feige 41 |
| Cinematographers | 831 | 72.6% | viable |
| Composers | 661 | 69.9% | viable |
| Screenplay | 1,013 | 40.0% | marginal |
| Collections | 245 | 11.8% | sparse but real (median size 2) |
| **Writer** | **491** | **20.1%** | **dead** — 2.0% at ≥10 |

`cast.order` is a quality filter, not just a size reduction. Unbanded, the
most-cast "actors" are Frank Welker (108, voice work), Bess Flowers (51,
uncredited extra) and a stuntman. `order<10` puts Bruce Willis at the top.

### The `adult`/`softcore` note

`adult=true`: 0 (the expansion filter held). But TMDB has a **second** flag,
`softcore`, which we never filtered on — 2 films. Negligible; it exists.

### Coverage ceilings — critical for any heat/rarity UI

**No keyword reaches even 13% of the corpus.** Highest is `based on novel or
book` at 12.5%. Bruce Willis is on 0.77%. Spielberg is on 0.36%.

| Keyword band | tags | % of vocab |
|---|---|---|
| 1 film only | 8,174 | 47.2% |
| 2–4 films | 5,300 | 30.6% |
| 5–25 | 3,170 | 18.3% |
| 26–85 | 557 | 3.2% |
| 86–425 | 126 | 0.7% |
| 854+ (>10%) | 1 | 0.0% |

**A global "below 30% coverage" threshold would flag every keyword, actor,
director, studio and collection** — only Genres and Decades ever clear it. Any
rarity heat scale must be **relative to its own section** (percentile within
section), never a global share of corpus.

### Traps found in the data

**`vote_average` is not comparable across eras.** Median by decade is U-shaped:
1920s **7.50** → 2000s **6.58** → 2020s **6.97**. Old films are inflated by
*survivorship* (bad 1920s films were never entered into TMDB); new films by
*small-sample enthusiasm*. Since `acclaimed`/`underseen`/`niche_loved` all gate
at a flat `va>=7.2`, a 1950s film clears the bar far more easily than a 2000s
one — not because it's better, but because its competition was never recorded.
Era-fair labels need a **percentile within decade**, not an absolute cut. OPEN.

**`underseen`'s top is statistical noise.** Only 4 films rate ≥9.0 and all are
small-sample artifacts (`The Way to the Heart`, va 9.9 on 143 votes). Since
`underseen` sorts `va.desc` over vc 100–800, these sit at the top *by
construction*. A shrunk/Bayesian average is the standard fix. OPEN.

**`both > 0` is not enough for budget/revenue.** Memoir of a Snail reports
revenue **$7** against a $4.35M budget — a ratio band would file it as a 0.000×
catastrophic flop. A **$10k floor on both fields** costs 22 films and removes
every such lie, while keeping the legitimate extremes (Paranormal Activity
really did cost $15k and gross $193M; only 5 films have a budget under $10k).

**Streaming's honest number is 60.5%, not 91%.** 91% of films have "a US
provider", but the head of that list is entirely transactional — "rentable on
Amazon" is true of 75% of cinema and filters nothing. Matching what
`streaming_services` *means* on the anime side (watch it here, not buy it here)
means **flatrate-only: 60.5%**, with Netflix at 8.4% rather than 75%.

### Finance viability

`budget>0` 65.5% · `revenue>0` 70.8% · **both>0 60.1%** · both>$10k 59.8%.
Ratio bands come out almost perfectly quartiled (24.9 / 27.4 / 24.3 / 23.3%).

But the skew is structural: **90% of both>0 films are English** (corpus is 77%),
and coverage collapses on old films (1920s 14%, 1950s 34%) *and* on recent ones
(2020s 46% — indie/streaming titles don't report budgets). A Finance section is
really a section about **mainstream English-language cinema, 1980–2010**. Fine
if named honestly.

**Top grossing ≠ mega success**: only 57% of the top-200 by revenue are also ≥5×
ROI, and 1,081 mega-ROI films aren't top-200 grossing. Different tags.

---

## 6. Existing app machinery this lands on

Worth knowing before designing anything new — most of it already exists:

- **`tags.category`** (migration 0004) already exists and `tagPool.ts` already
  filters on it. Director/Actor/Studio/Decade sections land on a column that's
  been there since day one.
- **`TagInfo.seriesCount`** is already the coverage number a rarity heat scale
  would read.
- **`LevelKey` 1/2/3** already tiers tag visibility by rank *and* count —
  low-coverage flavor tags belong at level 3.
- **`MixerError`** already distinguishes `impossible-min` from `no-match`. A
  rarity heat map turns a failure that's currently caught *reactively* into a
  signal read *before* it happens.
- **`isGenre: boolean` will need generalizing.** Genres are special-cased as a
  boolean that short-circuits level checks (`tagPool.ts:69`). Film has *four*
  weight-100 categories (genre, director, studio, decade). Since genres already
  get `avgRank: 100`, replacing `if (tag.isGenre)` with a weight check
  (`avgRank >= 100`) is behaviour-preserving today and generalizes for free.

### Shape mismatches the adapter must absorb

| | AniList | TMDB |
|---|---|---|
| Cover | `coverImage.large` — full URL | `poster_path` — build from `/configuration` + size |
| Streaming | `externalLinks` — global | `watch/providers` — region-keyed |
| Rating | `averageScore` 0–100, weighted | `vote_average` 0–10, unweighted |
| Runtime | `episodes` + `duration` | `runtime` |

---

## 7. Film tag pool — information architecture (SETTLED)

The design the film side promotes into. Anime's pool comes free from AniList's
hyphenated `category` tree (`Theme-Game-Sport`); film's has to be authored, and
it splits into two natures: **credits** (director/actor/studio/year — each
auto-derives its own section) and **content** (keywords we classify into
Theme/Setting/Tone). Reception is a third nature anime has no equivalent for.

**Layout: two tab rows.** Sections are the top row; selecting one swaps the
second row to its subsections. Never more than two tab rows + a chip grid, no
matter how deep the data.

**Eleven sections:**

| Section | Nature | Subsections | Show |
|---|---|---|---|
| Genre | genre | — | flat, always-on, weight 100 |
| Theme | content | Crime · Relationships · Genre-craft · Life & society | subsection tabs |
| Setting | content | Place · Period | subsection tabs |
| Tone | content | — (thin: amused, absurd, dark comedy…) | flat |
| Format | content | — (b&w, anime, 3D, musical…) | flat |
| Based on | content | Source · Franchise | flat + search |
| Reception | reception | Acclaim · Popularity · Box Office | flat (see §8) |
| People | credits | Actors · Directors · Composers · Cinematographers · Producers | **search + rank** |
| Studio | credits | — | search + rank |
| Origin | credits | Decade · Country | flat |

**Three section shapes, three treatments** — the key insight, since a uniform
tree is wrong:
- **flat** (Genre, Decade, Country, Tone, Format, Reception): just list them.
- **subsection tree** (Theme, Setting): the only place nesting earns its keep —
  a flat 6,321-keyword bag is unbrowsable; ~6 subsections make it navigable.
  This is the one real authoring task (classify the keyword head).
- **search + rank** (Actors 6,883, Studios 1,978, Directors, Producers…):
  cannot be subsectioned meaningfully ("Actors → surname M–P" helps nobody).
  Flat lists on a search box + popularity rank, showing the top-% by film count
  then progressive-loading on scroll/search.

**Coverage is NOT the section-worthiness test — connectivity is.** A tag on 10%
of the corpus is a *good* tag (specific, flavourful); a tag on 1 film is dead
(nothing to recommend). Floors remove singletons and sit **low** (≥2–3), not
high. **Use floors, not means**: Producer's mean of 0.97 films/person read as
dead, but at a ≥3 floor it covers 78.4% with a superb head (Blum 81, Feige 41).
Only Writer is genuinely dead (20.1% at ≥3).

**Section verdicts** (tags at ≥3-film floor / % films covered): Genres 19/100%,
Decades 14/100%, Countries 66/99.8%, Keywords 6,321/96.1%, Actors(order<10)
6,883/95.3%, Studios 1,978/92.4%, Directors 931/85.3%, Producers 2,026/78.4%,
Cinematographers 831/72.6%, Composers 661/69.9%, Collections 245/11.8%
(sparse-but-real, median size 2), Writer 20.1% (dead). `cast.order` is a quality
filter, not just size: unbanded, the top "actors" are Frank Welker (voice) and
uncredited extras; `order<10` puts Bruce Willis on top.

**Franchise (SETTLED).** Not one tag per collection — **one binary "Franchise"
tag** = belongs to a collection with **≥3 members in the corpus** (1,007 films).
2-film sets are excluded on purpose; their "there's another part" signal is
carried by the separate Sequel/Prequel/Remake tags (Based on → Franchise).
Corpus-based sizing is a v1 shortcut; a one-time `/collection/{id}` enrichment
(~1,058 calls) would give true franchise sizes if wanted. Individual tags in
that subsection: Sequel 732, Remake 217, Prequel 59, Reboot 52, Spin-off 51.

**Keyword grouping (authoring guide).** Hide production metadata
(`duringcreditsstinger`, `woman director` — only 24 films lose all keywords).
Then: Theme (murder 518, revenge 298, superhero 228…), Setting-Place (new york
379, paris 177…), Setting-Period (world war ii 189…), **Tone** (amused 226,
absurd 159, dark comedy 143 — the abstract "vibe" axis, most Konomi-ish, was
wrongly dismissed as junk once), Format (b&w 290, anime 203…), Based-on/Source
(novel 1066, true story 444…). ~200-keyword head is hand-placeable; the long
tail goes to a Theme→Other catch-all or stays search-only.

**Rarity heat (design note).** No keyword reaches even 13% of the corpus; the
busiest director is on 0.36%. So a rarity/heat scale must be **percentile within
its own section**, never a global % of corpus — a global 30% threshold would
flag literally everything but Genre and Decade. Half the keyword vocabulary is
singletons (dead); the 2–25-film band (~8,470 tags) is where the flavour lives.

---

## 8. Reception tags & the rating methodology (SETTLED)

Reception is the "how the world reacted" section — no anime equivalent. It
absorbs the Box Office idea as one of three subsections. **Recompute across all
8,531 films, never read `seed_buckets`** (those exist only on the 3,994 seed
films; 78% of expansion films would be blank). Reception is a **"sometimes"
section** — 46.5% of films earn no reception tag, so it can't be always-on like
Genre. Reception tags are **qualifiers, not identity** ("an acclaimed revenge
film") → normal weight, not the 100 that Genre/Decade get.

**Subsection map:**

| Subsection | Tags |
|---|---|
| Acclaim | Acclaimed · Era-defining · Divisive · Infamous |
| Popularity | Famous · Underseen · Niche favourite · Buzzing |
| Box Office | Blockbuster · Mega-ROI · Hit · Broke-even · Flop · Big-budget |

**Provisional thresholds** (all to keep tuning): Divisive `va 4.5–6.5 & vc≥600`
(1,673). Infamous `bottom ~300 by va, vc≥500` (≈`va≤5.35`). Famous `vc≥3000`
(1,884). Box Office bands on `revenue/budget`, **both fields > $10k required**
(never invent loss when a field is 0/missing): Flop `<1`, Broke-even `1–2.5`,
Hit `2.5–5`, Mega-ROI `≥5`, Blockbuster top-200 by revenue, Big-budget `≥$100M`.
Box Office is structurally a section about mainstream English-language cinema
1980–2010 (both>0 is 90% English, collapses pre-1980 and post-2020) — fine if
named honestly. Buzzing is snapshot-frozen `popularity`; refresh is cheap
(~525 requests) but a coherence choice — treat as a "topping" (re-pull the 500,
don't re-expand). Base label counts are audience-, not critic-, reception: the
tags mean **"beloved by audiences,"** which we accept as on-brand (TMDB has no
critic score and we can't fake one).

### Rating methodology (Acclaimed / Era-defining) — LOCKED

Two problems, two fixes, applied in order:

1. **Bayesian shrink** kills small-sample noise (`The Way to the Heart`, va 9.9
   on 143 votes → 7.45): `score = (v·R + m·C)/(v + m)`, where v=vote_count,
   R=raw va, C=global mean (≈6.75), **m=1000**. High-vote films barely move;
   thin ones get pulled to the mean.
2. **Percentile within decade** kills era-skew. A flat `va≥7.2` made the 1920s
   66% "acclaimed" and the 2000s only 24% (backwards — old films inflated by
   survivorship). Percentile makes each decade contribute its top slice
   proportionally.

```
Acclaimed     = m=1000 shrunk, top 15% within decade, vc ≥ 300
Era-defining  = m=1000 shrunk, top 2% within decade         (consensus base, vc ≥ 2000)
              ∪ (va ≥ 8.0 AND vc ≥ 2000)                    (impact path)
              + recency guard: release year ≤ (snapshot fetched_at year − 2)
Decades       = pre-1920s grouped; 1920s onward separate
```

- **m=1000 over m=500** (the shrink dial). m=500 = cinephile canon (surfaces
  foreign/anime/arthouse with fewer votes); m=1000 = mainstream canon (broad
  consensus). They agree on ~90%; the ~105 swaps each way are pure
  cinephile-vs-crowd. m=1000 chosen because the anime toggle already serves the
  anime-first audience, so the film side leans mainstream-recognisable — and
  m=1000 needs no noise floor (harder shrink buries thin-vote junk itself).
- **The impact path** re-admits substantial-audience films that shrink
  penalised: In the Mood for Love, Sunset Boulevard, The Seventh Seal, Stalker,
  8½, Persona, La Dolce Vita, The 400 Blows, Bicycle Thieves… (+35 films, all
  legitimate). `vc≥2000` over `≥2500`: the 11-film delta is *all* classics (The
  400 Blows, Persona, La Dolce Vita), zero noise. Keys on `va≥8.0` so it's
  "most beloved," which also admits a few crowd-pleaser stretches (Flipped,
  Togo, The Hate U Give) — accepted, consistent with audience-not-critic.
- **Recency guard from `fetched_at`, not "today"** — vote maturity is relative
  to when votes were captured, so a pinned corpus uses its own pull date. Makes
  every re-pull auto-current. At the 2026 snapshot → `≤2024`.
- **Result: ~205 era-defining (2.4%)**, per-decade counts scaling with decade
  size (1 pre-1920s → 57 in the 2010s). Old-decade lists spot-check as genuine
  canon; recency guard removed the 2026 noise (Project Hail Mary, Swapped…).
- **Fandom-inflated films (Gabriel's Inferno, vc 2474) allowed through** — a
  devoted following defines an era too, even if critically trash. Revisit with a
  small exclusion list only if it becomes a problem.

### The data wall — why some canon needs curation, not a formula

The sub-2000-vote masterpieces (Close-Up 452, A Brighter Summer Day 393, Ennio
385, Dersu Uzala 633, Grizzly Man 963, Passion of Joan of Arc 1097) **have fewer
votes than the noise films** — no vote-count rule includes them without also
admitting junk, because their greatness lives in critical consensus TMDB doesn't
measure. Fix: a hand-curated **"Konomi Essentials"** tag (STREAMING_ALLOW_LIST
precedent), ~50–100 films. A better home for them anyway than sneaking them past
a threshold — and genuinely on-brand for a taste-driven app.

---

## 9. Tag consolidation — the working taxonomy (IN PROGRESS, 2026-07-17)

Folding the raw keyword pool into canonical tags and reorganizing the Theme
subsections. Plan = consolidate → restructure → prune section-by-section. Steps
1–2 done; step 3 (pruning, esp. Crime) remains. **This is a resume point** —
after context compaction, pick up from "Current state" at the end.

### Process rules (LOCKED)

1. **Consolidate before floor.** Fold aliases into canonicals FIRST; apply any
   floor to the consolidated result later. Flooring first deletes hyper-specific
   tags before they contribute to their canonical's count → lost film coverage.
   Folding is coverage-safe; flooring alone is not.
2. **Dedup — count distinct films, not the sum of aliases.** A canonical's count
   is the union of films carrying ANY member. Measured savings are large
   (spy 262→196, christmas 230→175, world war 282→239, france 312→271).
3. **Rules, not edits.** Every fold/move/rename is a persistent adapter rule
   applied at promote on every import — raw keywords stay untouched. Known
   keywords always fold on re-import; genuinely NEW variant strings pass through
   until added (light upkeep), OR convert a fold to a **pattern** rule
   (`/christmas/ → christmas`) for zero-upkeep auto-catch. Per-section choice.
4. **Floors deferred.** Not applied. Consolidated canonicals sit well above any
   floor; only un-consolidated standalone singletons might need one, decided at
   the very end, and low (≥2–3) — low-coverage tags are good flavour.
5. **Move ≠ fold.** A cross-section MOVE changes placement (not count); a FOLD
   merges tags into one canonical (changes count via dedup).

### The consolidation ledger — 123 canonicals (`canonical ← members`)

Counts are real deduped film counts. Working copy: `ledger.json` (scratch).

**Tone (16 folded; rest standalone):** emotional ← moving · suspenseful ←
suspense · complex ← complicated · compassionate ← sympathetic, empathetic ·
grim ← gloomy, bleak, dark · earnest ← sincere, candid · joyful ← cheerful ·
admiring ← appreciative · audacious ← bold · heartwarming ← feel good ·
unsettling ← creepy, disturbing · hopeful ← optimistic · cynical ← pessimistic ·
reflective ← thoughtful, meditative · angry ← aggressive · melancholy ← wistful,
somber. (Standalone: amused, dramatic, intense, hilarious, whimsical, nostalgic,
adoring, atmospheric, moody, haunting, gore, satire, parody, etc.)

**Setting/Period (15):** christmas(175) ← eve/party/tree/music/spirit/special,
christmastime, saving christmas, christmas horror/romance · halloween(84) ←
party/night/costume · new year's eve(33) ← new year · easter(5) ← easter bunny ·
prehistoric(20) ← stone age, ice age · antiquity(47) ← ancient world, ancient,
1st–4th c, BC centuries · medieval(66) ← middle ages (476-1453), medieval times,
dark ages, black death, 5th–14th c · renaissance(29) ← 15th c, 16th c, tudor ·
age of reason(60) ← 17th c, 1600s, 1620s, baroque, 18th c · age of progress(149)
← 19th c, 1800s–1890s decades, victorian era · world war(239) ← WWI, post-WWI,
WWII, post-WWII, pacific war, french resistance, vichy regime, d-day, pearl
harbor · cold war(94) ← vietnam war, berlin wall, korean war, mccarthyism, cold
war era, cuban missile crisis, space race, iron curtain · modern war(52) ← iraq
war, war on terror, afghanistan war, gulf war, bosnian war, russo-ukrainian
war/war in ukraine/russian invasion of ukraine, the troubles, algerian war,
balkan war, world war iii · near future(57) ← 2030s–2090s, not too distant
future · distant future(17) ← 22nd–24th century. (Standalone: shōwa era, edo
period; set-decades 1900s–2020s each own tag.)

**Setting/Place:** Rule — cities fold into their **US state or country**
(`city, state → state`; `city, country → country`; iconic bare cities mapped:
hong kong→china, las vegas→nevada, hollywood→california, nyc+boroughs→new york).
~60 state/country canonicals result. Explicit period-place folds: france ←
occupied france, medieval france · italy ← ancient rome, pompeii · england ←
victorian england · egypt ← ancient egypt · japan ← feudal japan · greece ←
ancient greece · chile ← easter island · soviet union ← ussr. Place-types kept
standalone (prison, hospital, island, space, forest, castle, ship, submarine,
moon…). Kept separate: washington dc (no state), eastern europe.

**Theme/Politics (13) + History (2):** politics(126) ← usa/british/russian/
soviet/french politics, political crisis/instability/unrest/assassination/satire/
intrigue/scandal/repression/documentary/party, race politics, power politics ·
election(32) ← political campaign, presidential election/campaign, election
campaign · capitalism(37) ← capitalist, late stage capitalism, anti-capitalist ·
communism(21) ← chinese communism · political corruption(19) ← government
corruption · surveillance(41) ← surveillance state, mass surveillance ·
activism(29) ← political activism, protest, student protest, democratization
movement · propaganda(13) ← war propaganda, soviet realism · conspiracy(92) ←
government conspiracy, government cover-up (government secrets moved OUT,
standalone) · refugee(20) ← refugee camp/crisis, european refugee crisis ·
immigrant(28) ← undocumented immigrant · uprising(10) ← gwangju uprising · coup
d'etat(16) ← military coup · **civil war(51)** ← american/spanish/chinese/irish
civil war · **witch hunt(9)** ← salem witch trials. (civil war + witch hunt live
in History & Conflict.)

**Theme/Roles (3):** politician(125) ← corrupt politician, president, usa/vice/
ex/russian president, congressman, senate, congress, member of parliament,
presidential candidate · monarchy(56) ← king, queen, king of england, british
monarchy · caveman(12) ← cavemen, neanderthal, prehistoric man.

**Theme/Crime (1 so far):** spy(196) ← government agent, secret agent, undercover
agent, agent, special/female/woman/rogue/double/sleeper/corrupt agent.

**Theme/Military (6):** soldier(127) ← soldiers + 14 nationality/qualifier
variants · military officer(51) ← general, colonel, sergeant, lieutenant, army
captain/officer/general, u.s. general · veteran(87) ← war veteran, vietnam
veteran, ex soldier/military/army, retired army man, military/ww2/army veteran ·
fighter pilot(8) ← jet fighter pilot · sniper(40) ← female sniper, sniper rifle ·
military(68) ← soviet military.

### Cross-section MOVES (placement, not folds)

- Period → **History & Conflict**: concentration camp, wartime, life during
  wartime, children in wartime, empire, dynasty, holiday season, turn of the
  century, prohibition era, jazz age
- Period → **Fantasy & Sci-Fi**: ancient evil, prehistoric creature, ancient
  prophecy, seeing/vision of the future
- Period → **Place**: easter island (→chile), eastern europe
- Period → **Roles**: caveman group, gladiator, roman, pharaoh, knight, medieval
  knight
- Place → **Based-on**: based on magazine, based on myths/legends/folklore, based
  on song/poem/rhyme
- Place → **Sub-genre & Style**: high school, college, securities/stocks
  (reclassify later)
- Various → **Roles**: warrior, samurai, pirate, cowboy, nun, gunslinger, ninja,
  monk, outlaw, vikings, mummy, musketeer, barbarian, politician, monarchy

### Revised Theme structure (SPLIT FOR PRECISION — many now, reduce later)

Deliberately granular so tags can be visually organized; consolidation of
subsections is a later pass. Theme subsections:
- Crime & Justice — **431 raw tags, NOT yet folded** (clustered inventory ready)
- Love & Relationships
- Fantasy & Sci-Fi
- Sub-genre & Style (neo-noir, slasher, cyberpunk, romcom; + moved-in high
  school/college/securities)
- **Society & Identity** ← split from old "Society" (lgbt, race, coming of age,
  death, survival, religion, mental illness, slavery, apartheid)
- **History & Conflict** ← split from old "Society" (wars, revolutions,
  atrocities: nazi/genocide/holocaust, + moved-in historical periods)
- **Politics · Government · Ideology** ← promoted (was unassigned)
- **Military · Armed Forces** ← promoted (was unassigned)
- **Roles & Archetypes** ← promoted (warrior, knight, samurai, pirate,
  politician, monarchy, nun, cowboy…)
- **Spy · Intelligence Agencies** ← kept own; do NOT fold into spy (kgb, mi6,
  cia, mossad, black ops)
- Professions & Creatures (lawyer, doctor, teacher, dog, cat…)

Everything OUTSIDE Theme validated unchanged (Genre wt-100, Setting Period/Place,
Tone 17 moods, Format, Based-on Source/Franchise, Reception, People, Studio,
Origin). Deferred structural Q: Roles & Archetypes vs Professions & Creatures are
both "who" — may merge into "People & Roles" later.

### Sweep 8 — Tone & Emotion (2026-07-21) · **Bucket 1 BANKED**

**The frame (adopted this sweep).** Five buckets, and the key property is that
**bucket choice and part-of-speech are one decision** — pick the bucket, the label
follows. This replaced a per-family noun-vs-adjective argument (46 open calls) with
a single structural question:

| bucket | part of speech | test |
|---|---|---|
| 1 · Emotional Tone | adjective | how the **film** feels — a vibe |
| 2 · Thematic Anchor | noun | what the film is **about** |
| 3 · Sub-genre & Style | noun | what the film **is** — a named form |
| 4 · Character Disposition | adjective | how a **person in it** acts |
| 5 · Subject & Event (proposed) | noun | concrete things that happen |

60 of 61 families land cleanly. Known weak seam: **1 vs 4** — both adjectives, and
`cruel`/`defiant`/`callous`/`cynical` could sit either side. **181 keywords (death,
violence, illness — 2,917 mentions) have no bucket in the original four**; bucket 5
is the proposal, the alternative is routing them to Crime & Justice and Society &
Identity, which already hold `murder` 684 and `death` 137.

**⚠ RETRACTED FINDING — do not re-derive it.** An earlier pass measured how often
an adjective and its noun tag the same film, got 0–10%, and concluded they were
different concepts. **That was a bad-baseline error.** These keywords are so rare
that **31 of 36 families expect under one film of overlap by chance** — `hostile`
(21 films) × `hostility` (13) across 8,531 films expects **0.05**. Measured against
chance instead, **all five families with enough mass co-occur ABOVE chance**:
cruelty 7.9×, satire 5.0×, sadness 4.3×, fear 2.8×, anger 1.6×. Sparse overlap is
what TMDB tagging looks like when a tagger picks one of several interchangeable
words — an argument *for* merging, not against. **No fold rule was written from it.**

**Bucket 1 banked — 25 Tone canonicals**, 21 folds, **11 canonicals dissolved**
(melodrama, joyful, admiring, melancholy, hopeful, unsettling, heartwarming, emotional, intense, complex, amused), 26 keywords deliberately unhomed.

`cheerful` 456 · `suspenseful` 355 · `heartfelt` 326 · `nostalgic` 228 · `anxious` 212 · `dramatic` 201 · `inspirational` 200 · `absurd` 200 · `angry` 186 · `depressing` 169 · `grim` 164 · `surreal` 141 · `compassionate` 137 · `awestruck` 137 · `tragic` 135 · `ambiguous` 134 · `shocking` 132 · `desperate` 122 · `comforting` 117 · `satirical` 111 · `reflective` 108 · `earnest` 95 · `hopeless` 79 · `sentimental` 79 · `macabre` 63 · `mischievous` 49

**Section moves applied:** `dark comedy` 143 Tone → Sub-genre & Style (a named
form, not a feeling). `surreal` 141 (surreal + surrealism) → **Tone/Bucket 1** —
user reversed an initial Sub-genre placement; the surrealism keyword dissolved into
`surreal` as the main tag.

**New section `Character Disposition` (bucket 4), seeded:** `audacious` 299
(courage + provocation merged — audacious, bold, provocative, bravery, courage,
defiant, heroism) · `cynical` 97 (gained derisive, scathing, biting, sardonic out
of satirical).

**Still sitting in Tone but belonging elsewhere** — move when their bucket is ruled
on: `angry` 186 and `compassionate` 137 → Disposition; `reflective` 108 and
`earnest` 95 → undecided.

**26 keywords deliberately loose** (1197 mentions) — held out to condense
first, not missed: `amused` 226, `hilarious` 119, `complex` 89, `vibrant` 86, `playful` 84, `whimsical` 83, `affectation` 75, `cliché` 60, `lighthearted` 59, `witty` 56, `complicated` 51, `mysterious` 46, …
This deliberately dissolved `amused` 226 (the largest Tone canonical) and
`complex` 127.

**⏸️ NEXT: Bucket 2 — Thematic Anchors (noun).** 13 families: grief, guilt,
identity, memory, redemption, morality, obsession, loneliness, disillusion,
suffering, greed, ambition, innocence. My open recommendation from the bucket
review: `madness`, `paranoia`, `sadism` and `cowardice` should probably move from
bucket 4 to bucket 2 — a film is *about* insanity — because their film mass sits
firmly on the noun side (insanity 107 vs psychotic 20; paranoia 87 vs paranoid 34).
Artifact: https://claude.ai/code/artifact/15f8e86f-1a93-4073-a816-96f8b3117a19
**Bucket 2 — Thematic Anchor (noun) BANKED (2026-07-21).** New section, 9 canonicals:
`grief` 291 · `isolation` 123 · `obsession` 110 · `self-discovery` 95 · `shame` 81 · `ambition` 59 · `redemption` 55 · `greed` 38 · `disillusionment` 23.
- `grief` 291 merges the grief + suffering families (loss of loved one 176 is its biggest member; user chose `grief` as the label).
- `isolation` 123 — **renamed from `loneliness` and moved OUT of Society & Identity** into this section (+ alone, solitude, seclusion, recluse).
- `self-discovery` 95 deliberately broad — merges identity + morality + innocence.
- `shame` 81, `self-discovery` 95, `isolation` 123 are each labelled after a smaller keyword than their biggest member (guilt 31, identity 30, loneliness 48) — deliberate thematic naming, confirmed by user.
- `temptation` + `infatuation` folded into the **existing** Love & Relationships `desire` tag (51→58), not a new tag.
- Loose (5): `memory` 30, `memories` 9, `carefree` 3, `hedonism` 3, `perfectionist` 4.

**📌 USER-REQUESTED FOLLOW-UP (after the Tone/Emotion artifact is fully worked):**
do a re-home pass across Society & Identity, Tone, and Thematic Anchor (and
neighbours) applying the same bucket logic — check whether each existing tag fits
better as a Tone (adjective vibe), a Thematic Anchor (noun theme), or in an
existing category. Finish the current artifact's buckets FIRST, then revisit.

**Bucket 4 — Character Disposition (adjective, mostly) BANKED (2026-07-21).** 20 canonicals:
`audacious` 299 · `aggressive` 251 · `candid` 165 · `sadistic` 154 · `compassionate` 150 · `powerful` 148 · `insanity` 124 · `paranoia` 118 · `cynical` 113 · `philosophical` 111 · `baffled` 110 · `critical` 103 · `disrespectful` 78 · `dignified` 72 · `arrogant` 69 · `apathetic` 47 · `bitter` 45 · `hostile` 43 · `curious` 28 · `cowardly` 24.
- Pulled OUT of Tone: `angry`→**`aggressive`** 251, `earnest`→**`candid`** 165, **`compassionate`** 150 (+empathy, solidarity), and `reflective` dissolved.
- **`sadistic`** 154 merges the sadism family + cruelty, cruel, malicious, mercilessness, depravity. `harsh` 30 + `callous` 29 → loose (the two cruelty-family leftovers not pulled in).
- **`insanity`** 124 (was psychotic) and **`paranoia`** 118 (was paranoid) are deliberately NOUN labels inside the adjective bucket — user's call, they read better; flags them as candidates for a future mental-state grouping.
- **`philosophical`** 111 = philosophical + existentialism + objective + subjective; `thoughtful` → `heartfelt` (Tone); `reflective`/`meditative`/`introspective` → loose.
- **`cowardly`** 24 is a custom label (not a keyword) over cowardliness + cowardice.
- `cynical` 97→113 (+cynicism, cynic, misanthrope, misanthrophy).
- Loose (9): `frustrated` 33, `harsh` 30, `callous` 29, `selfishness` 5, `insecure` 9, `unsociability` 23, `introspective` 39, `reflective` 50, `meditative` 17.
- Tone now down to 22 canonicals (lost angry, earnest, reflective, compassionate).
- **BANK BUG FOUND + noted:** the generic bank frees keywords going *into* a tag but not keywords going *loose* that are already members of an existing canonical — `reflective`/`meditative` got stranded in the dissolving `reflective` canonical and needed a manual strip. **Future bank scripts must also strip `loose[]` from all canonicals and dissolve emptied ones.**

**Bucket 5 — Subject & Event (noun) BANKED (2026-07-21).** New section, 5 new tags:
`cruelty` 318 · `psychopath` 137 · `virus` 104 · `sickness` 103 · `execution` 32.
- **`cruelty`** 318 is NEW and **dissolved the just-banked `sadistic`** disposition tag, absorbing all 10 of its members + sadistic horror, harassment, torture, brutality, violence, violent. (User: may flip back to a `sadistic` character tag in the re-eval; for now it's `cruelty`.) Character Disposition dropped 20→19.
- **`psychopath`** 137 = psychopath, sociopath, sadistic psychopath, psycho. **`virus`** 104 (virus, infection, outbreak, epidemic, pandemic, quarantine, plague, cholera, tuberculosis, leprosy). **`sickness`** 103 (cancer, leukemia, aids, hiv, illness, disease, medicine). **`execution`** 32 (execution, public execution, guillotine, gallows, hanging).
- **Folded into EXISTING tags, not new:** `death` 137→447 (+34 death/rites), `suicide` 149→216 (+7), `gore` 119→184 (+7: decapitation, beheading, dismemberment, mutilation, impalement, cannibal, cannibalism), `hostile` 43→48 (+death threat).
- **78 keywords loose** — the whole fights/battles group (fight 99, battle 55, sword fight 50…) held for re-eval; mental-state residue (nightmare, amnesia, hallucination, schizophrenia); medical odds (coma, surgery, injury, disfigurement, paralysis); `strangulation` (was double-named gore+loose, user chose loose); 8 franchise-ish "death"/"killer" terms (evil dead, death game, day of the dead, killer whale/shark/doll…).
- **Section is provisional** — `psychopath` may re-home to Crime & Justice (near serial killer 227), `virus`/`sickness` to Society & Identity (near mental illness 91) in the re-eval pass.

**⏸️ NEXT (sweep 8 essentially complete — 4 of 5 buckets banked):**
1. **Bucket 3 · Sub-genre & Style confirm** — existing 42-canonical section, only needs a review pass (moves already applied: dark comedy in, surreal to Tone).
2. **`instruction` tag** — cautionary/informative/factual/didactic (137f) still loose; likely Format.
3. **User-requested RE-HOME / RE-EVALUATE pass** across Society & Identity, Tone, Thematic Anchor, Character Disposition, Subject & Event — apply the bucket logic to EXISTING tags to check each fits its section (is it a vibe→Tone, a theme→Anchor, a form→Sub-genre, a disposition→Char, a subject→Subject&Event, or an existing category?). Provisional Subject&Event placements (psychopath→maybe Crime, virus/sickness→maybe S&I) get decided here. cruelty may flip back to sadistic character tag.
4. Then the ~3,000-keyword long tail at the ≥3 floor.
Artifact: https://claude.ai/code/artifact/15f8e86f-1a93-4073-a816-96f8b3117a19


## ⏸️ RESUME HERE — SESSION CHECKPOINT (2026-07-24 · RETHINK ✅ + NAMES ✅ — structure FINAL)

**State: `tag-rules/master.json` = 1,120 canonicals / 6,561 member strings / 0 loose / 0 hold.**
Roadmap steps ①–④ done, names pass done. **⏭️ NEXT = STEP ⑤ ADAPTER WORK**, per group and
sometimes per section: tag-pool floors + level gating · genre passthrough (wt-100) · reception
identifiers + the user-owned rating transform · franchise shelf (belongs_to_collection +
/collection) · credits adapter · facts adapter · THE IMPORT DELTA REPORT (per-pull review
surface). API considers awaiting decisions: certifications · watch/providers · budget+revenue ·
/movie/changes feed · /person popularity.

**FINAL STRUCTURE (4 pillars / 34 sections, sentence-case standard everywhere):**
- **Feel (54):** Mood 37 · Attitude 17
- **Setting (292):** Era 29 · Time of year 11 · Regions 22 · Map 132 · Natural world 18 ·
  Built world 68 · Vessels 12
- **Story (564):** Archetypes & people 57 · Professions 85 · Crime 19 · Events & actions 45 ·
  Themes 45 · Mind & health 36 · Identity 47 · Love & family 55 · Faith 8 · Engines of
  society 36 · War & conflict 22 · Sports 21 · Arts & performance 13 · Vices 6 · Pursuits &
  hobbies 7 · Animals & nature 39 · Objects & weapons 23
- **Style (210):** Sub-genres 73 · Wondrous worlds 29 · Bestiary 26 · Arcana 24 · Filmcraft 30
  (Craft & format + Narrative devices merged — browse-model over taxonomy; found footage was
  the proof) · Based on 15 · Cinema waves 8 · Sagas 5

**LEVEL NAMES (loosely settled, user):** Moviegoer · Film buff · Cinephile. Alternates noted
for later: Casual/Buff/Cinephile · Matinee/Marquee/Criterion (brand caution) · Viewer/Buff/
Auteur.

**STEP ⑤ PART 1 ✅ DECIDED (user, 2026-07-24) — `tag-rules/adapter-config.json` is the
checked-in knob file.** Three distinct experiences BY DESIGN (MVP; tune in production):
- **Moviegoer = 33 tags** (19 genres + 14 reception; tag-kw OFF)
- **Film buff = 437 tags** (UNIVERSAL floor 55 — severe on purpose; no per-section gating
  for now) · buff cards average 6.7 tags · 459 films kw-less at buff → genre/reception ride
- **Cinephile = 1,153 tags** (no floor — the full pool; the buff→cinephile jump is dramatic
  and intended)
- **Empty-section rule:** a section with nothing above the active floor is simply not
  selectable in the UI (at 55 exactly one hides at buff: Cinema waves — max tag 30f).
- **Zero-kw fallback CONFIRMED**; measured cause: 315 films have NO keywords on TMDB at all
  (keywords are community-contributed) + 23 carry only sub-floor strings.
- Section reading order banked in pillar_tree (user final; SPORTS inserted between Faith and
  Arts & performance — flagged, unconfirmed). Board has live floor control + collapse toggle.
- **DEFERRED post-launch (user):** per-section floor tweaks · Map restructure/condensing ·
  level-name final confirm.

## ✅ STEP ⑤ ADAPTER DESIGN — COMPLETE (2026-07-24 · all 6 parts banked in tag-rules/adapter-config.json)

① **Tag-pool gating**: Moviegoer 33 (genres+reception, no tag-kw) · Film buff 437 (universal
floor 55) · Cinephile 1,153 (no floor) · empty-section-hidden rule · heat = percentile within
section. ② **Genres + reception**: 19 wt-100 passthrough · ALL 14 reception tags at MVP incl.
era-defining (locked §8 recipe) · raw vote_average display · box-office stacking rule.
③ **Sagas**: shelf floor ≥2 (594 sagas / 1,705 films) · 465 singletons card-only read-only ·
one Sagas home · strip " Collection" · all levels · promote-as-tags. ④ **Credits**: buff+
cinephile · all six categories (actors order<10 6,883 · directors 931 · studios 1,978 ·
producers 2,026 · cinematographers 831 · composers 661) · writers excluded (measured dead) ·
floor ≥3. ⑤ **Facts**: Origin selectable tags (decade 14 · country 66 · original language,
buff+cinephile) · **certifications selectable (US primary) — needs THE ONE NEW PULL: a
release_dates hydrate pass (~8,531 req)** · card facts (year, runtime, rating, poster,
overview, budget/revenue, singleton saga names) · runtime/year band-tag stubs reserved
(config-only later change; decade demonstrates the pattern) · **watch providers ALREADY in
raw** (zero requests): card-back flatrate links, JustWatch attribution required, refresh =
post-MVP topping. ⑥ **Import delta report**: after every pull — auto-integrated / manual
queue w/ suggested homes / IA-pressure flags — rendered as an artifact board.

**⏭️ WHAT REMAINS OF STEP ⑤ = IMPLEMENTATION:** write the promote code (reads master.json +
adapter-config.json → fills the shared catalog partition) · the certifications hydrate pass ·
the delta-report generator · shared-catalog schema for the film partition. Then UI. Surface
board artifact 0af35cf2 visualizes every banked layer; boards cc16cb4a (master) + c3f4e8e9
(review) unchanged.

**STEP ⑤ PART 3 ✅ BANKED (user, 2026-07-24) — the Sagas shelf, in adapter-config.json.**
Measured from raw payloads (zero new requests): 25.4% of corpus (2,170 films) carries
belongs_to_collection · 1,059 distinct collections · top: James Bond 20, Fast & Furious 11,
Saw 10, Star Wars 9, Harry Potter 8. RULINGS: shelf floor ≥2 corpus films (594 usable sagas /
1,705 films — every selectable saga guarantees ≥1 more film; §7 connectivity rule) ·
465 singletons = card-only READ-ONLY display, disabled as tags · ONE Sagas home (named shelf
search+rank beside the 5 mechanics tag-kw) · strip " Collection" from labels · all levels
incl. Moviegoer · each ≥2 saga promotes AS a tag (type: saga) so slots/recommend/random need
no special-casing. CLARIFIED (user): Origin facts (original language, countries) are FULL MVP
values, no holds — only the foreign INGEST-bucket exploration is deferred.

**STEP ⑤ PART 2 ✅ BANKED (user, 2026-07-24) — genres + reception, in adapter-config.json:**
genres = passthrough (19, wt-100). **ALL 14 reception tags ship at MVP** — 13 as raw-field
thresholds + **era-defining IN MVP** via the locked §8 recipe (user clarified: only their
custom rating mechanism is post-MVP; era-defining and default TMDB ratings ship now).
Display rating = raw vote_average. Box-office stacking rule recorded (ROI bands exclusive
among themselves; blockbuster/big-budget stack freely — Avatar is all three, John Carter is
big-budget flop).

### Foreign-film ingest probe — MEASURED 2026-07-24 (back-pocket; nothing built)
User asked to size a possible foreign-only corpus bucket. Results (scratchpad
`foreign-probe.json`):
- **A global "top-voted non-English" bucket is worthless: 93% overlap.** In TMDB's top
  3,000 films by vote count only 204 are non-English (6.8% — measured proof of WHY vote
  gates skew English), and **190 of those 204 are already in the corpus.** The 14 missing
  are the vc 1,800–2,500 / va<7.2 slice (The Cat Returns, Taxi 2, Colonia, Look Who's
  Back…) — fr 5, ja 2, it 2, de 2, da/es/sv 1 each.
- **A stratified per-language bucket is the real formula if ever wanted** (the era-bucket
  logic applied to geography: vote gates skew English like they skew modern). Top-60 per
  language, in-corpus coverage: ja 54/60 · it 50 · fr 49 · es 47 · cn 41 · ko 44 · zh 31 ·
  de 28 · sv 23 · da 21 · pt 20 · ru 19 · th 14 · tr 12 · **hi 11/60 (Bollywood is the
  biggest gap)**. A 15-language top-60 bucket would add ~430 films, concentrated in
  Hindi/Turkish/Thai/Russian/Portuguese/Scandinavian commercial cinema (per-language vc
  floors are thin there: hi 266, tr 130, th 60 — TMDB voting is shallow in those markets).
- UI framing when revisited: "original language / country of production" facts (already
  100% coverage, land free in the facts adapter) rather than a "foreign" label.

**HELD IDEA (user, 2026-07-24):** a future all-section-names pass — concise with a touch of
flair, `Engines of Society` as the model. Board artifact cc16cb4a now has a collapse-sub-tags
toggle. Full wave-by-wave record in sweeps[] (`rethink-*` records, wave 1 → COMPLETE).

## THE LAYER MAP — confirmed plan of record (user walkthrough, 2026-07-24)

User re-confirmed the full data architecture before step ⑤; verified consistent with §1
(raw landing → adapter → shared catalog → app) and everything settled since. The buckets:

1. **Corpus identifiers** (import seed buckets: famous/infamous/buzzing… — measured §"seed")
   and **TMDB genres** (wt-100 coarse layer) = the quick-association identifiers, weighted 100%.
2. **The keyword alias map** (this whole consolidation: 1,120 canonicals / 35 sections) = the
   flavor layer. Ranking TBD: based on finalized deduped counts (already carried per tag) and
   titles-across. **GUARDRAIL (measured, standing):** any rarity/heat/rank scale is
   PER-SECTION, never a global percentage — no keyword covers even 13% of the corpus; floors
   not means.
3. **Direct data** (credits/staff, belongs_to_collection, release data, production companies,
   posters…) = same ranking approach, adapter-shaped per group.
4. **Level gating** (the anime casual/seasoned/otaku analog): rank level toggles which layers
   surface — lowest = genres + corpus identifiers only; highest = the full chosen tag surface.
   Candidate mechanism: per-section floors that TIGHTEN per level (one knob, no new machinery).
   Film-side level names TBD (fold into the names pass).
5. **Then features** (search, tag grouping, result-card sections) come after the data layers
   are locked — feature design consumes the adapter output, never reshapes it.

**Two-layer rules split re-confirmed:** pull/shape rules live with the import (probe → seed →
expand → hydrate → report; raw landing untouched, jsonb, no hand schema); promote rules live
with the adapter (floors, weights, label precedence, franchise shelf). Anime and movie stay
separated at the pull, unified at the shared catalog so the app experience is seamless.
**ISOLATION CLARIFIED (user confirm, 2026-07-24): "unified" = same schema/infrastructure and
UI patterns, NEVER mixed data.** The catalog is partitioned by medium/source; the anime side
reads only AniList-derived rows and tags, the film side only TMDB-derived rows and tags. Tag
pools are disjoint objects (a film tag's members are film ids — it cannot return anime, and
vice versa), so the recommend engine is isolated per side by construction. The UI toggle
flips which partition the whole surface reads. Known conceptual overlap, not a data bleed:
anime FILMS (e.g. Ghibli features) exist on both sides as separate records from their
separate sources — by design (sweep-17 standing direction: AniList owns anime granularity;
the film side maps anime vocab to film-native tags).

### TMDB API inventory (what exists vs what we use — checked 2026-07-24)
| Data | Status |
|---|---|
| genres, keywords, title/overview/tagline, release_date, runtime, original_language | ✅ have (hydrated) |
| vote_average, vote_count, popularity | ✅ have (Reception methodology §8) |
| belongs_to_collection | ✅ planned — the franchise shelf (adapter step ⑤) |
| credits (cast + crew: director, writer, composer…) | ✅ planned — people tags, per-group adapter |
| images (posters/backdrops/logos), videos (trailers) | ✅ planned — display assets |
| production_companies / production_countries | ✅ planned — studio/country facts |
| **release_dates → per-country certifications (age ratings)** | ⭐ CONSIDER — content-rating facet/filter |
| **watch/providers (JustWatch streaming availability per region)** | ⭐ CONSIDER — big product value, later |
| **budget + revenue** | ⭐ CONSIDER — blockbuster/indie signal for ranking |
| **/movie/changes delta feed** | ⭐ CONSIDER — sync hygiene for catalog freshness |
| /person endpoints (person popularity, combined credits) | ⭐ CONSIDER — ranks cast/director tags |
| /collection details (name, parts, artwork) | needed WITH the franchise shelf |
| alternative_titles, translations | maybe (localized titles) |
| recommendations, similar, reviews, lists, external_ids | ✖ skip — Konomi's own logic covers these |
| trending / discover / now_playing / top_rated / upcoming | ✖ skip for corpus (pinned snapshot); possible refresh sources later |

**TWO NUANCES ADDED (user, 2026-07-24):**
- **User ratings:** vote_average/vote_count are pulled raw (✅ have); the user will run THEIR
  OWN rank transform over them for a better distribution — this lives adapter-side and is
  user-owned (may extend/replace the §8 distribution shaping; the Bayesian-shrink + percentile
  machinery is the starting point, not a constraint).
- **The IMPORT DELTA REPORT (a required build):** distinct from TMDB's `/movie/changes` feed
  (that's the SOURCE-side sync input — which movies changed upstream, so re-hydration is
  cheap). What Konomi needs on top is the KONOMI-SIDE review surface: after EVERY pull, an
  auto-generated report that categorizes the delta — (a) data auto-integrated and WHERE (new
  keywords that matched existing member strings → their canonical/section), (b) the
  manual-integration queue (new ≥floor strings with suggested homes, propose-first, exactly
  the wave rhythm), (c) IA-pressure flags (sections growing oddly, new clusters that suggest
  tag-IA changes). The alias map makes this natural: every incoming keyword either matches →
  auto-lands, or is new → queued. Both mechanisms wanted: changes feed for cheap sync, delta
  report for human review.

**⏭️ ORDER: ① the section-names pass (user wants it BEFORE further roadmap) ② step ⑤ adapter,
per group and sometimes per section (tag-pool floors + level gating · genre passthrough ·
reception identifiers · user-owned rating transform · franchise shelf · credits · facts ·
the import delta report).**

## (superseded checkpoint below)
## ⏸️ RESUME HERE — SESSION CHECKPOINT (2026-07-24 · ZERO LOOSE + ZERO HOLD · the roadmap below is current)

**State:** `tag-rules/master.json` = **1,204 canonicals / 6,561 member strings / 0 loose / 0 on
hold** (excluded.json ledger EMPTY — kept as a shell). ~47 sweeps[] records. Corpus pinned 8,531
films (snapshot 2026-07-17). Every keyword ≥3 is a canonical member EXCEPT the 15 bare genre
words (romance 100 · romantic 100 · horror 35 · war 34 · adventure 32 · historical 19 · fantasy 17
· mystery 17 · comedy 13 · animation 9 · action 8 · science fiction 8 · thriller 5 · documentary 5
· western 4). **✅ RESOLVED (user, 2026-07-24): the genre-synonym DROP STAYS — sweeps record
`genre-drop-reaffirmed`. Scope clarification: the zero-exclusions rule bans arbitrary
fit-judgment restrictions on incoming keywords; it does NOT touch the settled initial rule set
(the genre-vs-keyword layer split and its keep-vs-drop rulings remain in effect).**

**⏭️ THE ROADMAP (user-defined, 2026-07-23):** ① ✅ DONE re-organize residue to zero lingering
(loose = 0, hold = 0, zero exclusions achieved 2026-07-24) ② ✅ DONE final missed-≥3 sweep (only
the 15 genre words above remain — ruling pending) ③ PLACEMENT REVIEW (all accumulated flags —
the flag list lives further down: game/Pursuits, identity trio, k-pop→idol group, weather+forces
of nature in A&N, mythical-creature pull-outs, housekeeper umbrella, recovery candidate,
vision/psychic, pop-star-vs-rock-star, self-referential note, stock-market-in-Locations, romance
premises→forbidden love?, desire to have children in fertility, approach→dating + culture→culture
clash weak fits, affectation-in-cliché note, Franchise-in-Pursuits `video game`) — **✅ DONE
(2026-07-24, sweeps `placement-review-1-banked`): all 12 flags ruled. Moves: morality trio→moral
dilemma · dragon 40/fairy 29/mermaid 18/elves 18 pulled out of mythical creature (shelf keeps
the scatter at 71f) · rich-man-poor-woman pair→forbidden love · stock market→Forces &
Institutions (+absorbed `securities, stocks and bonds` per user) · idol group→Characters. Rest
closed as KEEP; scientist+radio stale notes cleared. GENRE CONFIRMATION (user): only the 15 bare
genre names drop; genre-adjacent keywords with signal are kept (romantic comedy→romcom, action
hero→hero, horror spoof→parody…); sub-genres never roll up. 1,207 canonicals.** ④ the
COMPREHENSIVE RETHINK — the user's "deep dive": full-master
re-org analysis, rethink groupings, break-outs under new names, best-fit check on every
assignment. **WAVES 2–3 ✅ BANKED: Feel (insanity+paranoia→Mind & Health, baffled→Mood,
affectation→arrogant, unsociability→loner; Mood/Disposition split holds, grain adjective-true).
Setting COMPLETE — 7 sections w/ one-line grains: Era 29=periods · Seasons & Holidays 11=time
of year · Regions 22=named areas · Place=political units (türkiye renamed per user) · NEW
Natural World 18=nature+cosmos (incl. countryside/space/planet/arctic; Option A, user) ·
Locations=built places · Vehicles 12=vessels. WAVE 4 ✅ (abstract trio): military life→W&C ·
government secrets→conspiracy · deception→dishonesty 129f · teenage rebellion→juvenile
delinquent. WAVE 5 ✅ (Events+War): slavery/colonialism/apartheid→I&S · coup d'etat→W&C ·
national history→Themes · 32 micro-dissolves (named revolutions→revolution 58f ·
revolt/insurgence/uprising→rebellion 51f · around-war→wartime · war toll→warfare 84f · spy-op
dust→undercover/espionage/surveillance/fbi · bribery→corruption · counterfeit money→fraud);
W&C now ~24 strong. WAVE 6 ✅ (Characters 157, healthiest giant): unemployment→worklife 234f ·
labor union→F&I · female empowerment→I&S · roommates→R&F · federal-agent dust→spy 243f + fbi ·
7 micro-people folds (roman→historic empire etc). WAVE 6B ✅: police DIVIDED (NEW buddy cop
45f Sub-genres · NEW sheriff 80f lawman shelf · police state→dystopia · police keeps 456f) ·
HISTORIC-FIGURE RULE: figures fold to their most specific WORLD shelf; ancient/imperial =
historic empire 112f (pharaoh, cleopatra, napoleon bonaparte, sparta greece + floor-waived
caesar/genghis khan/alexander/marie antoinette); billy the kid+jesse james→american west ·
mozart→musician. WAVE 7 ⏳ AWAITING RULINGS (c3f4e8e9 `rethink-wave-7`): F&I 66 + R&F 59 —
genius→Characters (person in R&F!) · evil/mischievous child→Characters · pornography→F&I ⚑ ·
-ism dust 10 folds · government/secret-org 4 folds · military→army ⚑ · scotland
yard+interpol→police ⚑ · atheism→religion ⚑ · empire→historic empire ⚑. REMAINING: Pursuits
50 + A&N 40 + O&W 24 · Style & Format (~216).**
**WAVE 1 ✅ BANKED (2026-07-24, sweeps `rethink-wave-1-banked`): school SPLIT →
college 100f + high school 203f (ambiguous words stay in school 196f per user) · athlete
DISSOLVED (players→their sports; motorsport+f1→racing; driving range→golf) · career DISSOLVED
into workplace RENAMED `worklife` 180f (custom label, user) · activism RENAMED `protest` · NEW
SECTION Style & Format/Narrative Devices (11 device tags moved from Sub-genres & Styles; maybes
anthology/horror anthology/anthropomorphic/mockumentary stay per user).**
**⏭️ REMAINING-RETHINK METHOD (user, 2026-07-24): GROUP-AT-A-TIME × FULL-LINEUP — take one
group and scan every tag in it against the ENTIRE master for shifts, merges, new creations,
dissolutions (groups with too many sections done in parts — the point is fuller group context,
incl. whether the grouping itself still makes sense). PLUS the NAMING-GRAIN lens: per group,
note the dominant reading (noun vs adjective vs verb) and suffix families (-ism, -ty…);
propose gentle renames toward the group's grain where natural — never forced, no
over-correction. Proposed wave order: Feel (Mood+Disposition) → Setting (Era · Place ·
Locations) → Story section-by-section (big ones in parts) → Style & Format.** ⑤
ADAPTER WORK (per-section display floors; franchise shelf from TMDB belongs_to_collection).

**LANDMARK — DECLINED (2026-07-23, user):** no landmark tag for now; strings stay in their place/
concept homes; the 35-string/145f measurement is preserved below for any future revisit.

**THE GREAT RE-INTEGRATION — BANKED + COMMITTED 90b9ecb (2026-07-23, user directive: exclusion
RULES DISSOLVED; every string placed at face value; subjectivity welcomed as product voice; dedup
protects counts; pollution risk accepted + re-evaluable).** State: **1,196 canonicals / 6,448
member strings / 0 loose / 113 on-hold** (excluded.json repurposed as the ON-HOLD ledger — no
blanket rules, just strings individually without a confident home yet, revisit any time).
~500 face-value folds (transporter→driver, governor→politician, twist→plot twist, robin→animals,
titanic→ship, groundhog day→time travel, future→near future, editorial words→nearest moods,
tea+candy→food…) + 16 NEW tags: secrets 65 · honor 28 · conflict 32 · determined (Disposition) ·
body 30 · blonde 15 · future city 14 · film formats 28 · charity · moving house · landlord ·
insurance · horror comedy · **ethnicity generalization per user: asian (asian/chinese/japanese
woman+family strings), irish, romani (respectful label for gypsy)** · scarecrow→farm +
lecture→professor. Every ≥3 keyword: canonical member or on-hold-by-name.
**STATUS UPDATE (2026-07-23): re-integration REVIEWED — ~60 user amendments + 17 question rulings
BANKED (committed). 1,202 canonicals. New since review: futuristic 115 (dissolved future city +
vision/seeing the future; +future/futuristic/hoverboard) · washington (the STATE) · hotel staff
(ex-concierge +doorman) · rope [+noose: not always execution, sometimes self harm] · accident
[+mistake] · artificial · lockdown [can mean shootings] · balloon · legacy · plan · clock · crude
(ex-crude humor) · battle 133/fight 260 grew (destroy-family, conquest, versus pair, street war,
battle assignment, battle for power). **FINAL HOLD PASS BANKED (73 placements + user amendments:
rookie→training, taipei→taiwan [user overruled sensitivity], NEW slacker, power dynamics→forbidden
love…). THEN THE FINAL 40 BANKED (2026-07-24, sweeps `final-40-word-first`) — hold ledger EMPTY.**
Placed on WORD-CONCEPT logic (STANDING RULE, user: place by what the word means, never by
movie/corpus association; corpus shared only as context, or when the string has no word meaning —
parker→heist + tuwaderalit→space opera are the two corpus-by-necessity cases). User rulings:
ceremony→party (a gathering/celebration; party holds `celebration`) · institution→legacy
(foundational/enduring) · horror for children→dark fantasy (genre register) · early america→age of
reason (colonial read) · orient→historic empire (era-of-Asia read) · NEW vibrant [Feel/Mood] 86f ·
violence against women→abuse · battle of the sexes→feminism (override approved). Word-first
corrections that came out of the rule: vertigo→anxious (dizziness/fear, NOT the film) · action
horror→survival horror (fight-the-threat, not monster) · chewing gum→food · modernity→slice of
life. After ruling: final missed-≥3 sweeps → placement review → COMPREHENSIVE RETHINK → adapter. (superseded status: re-integration banked but UNDER USER REVIEW** — I folded without the usual
propose-first pass (process miss, acknowledged); review surface published at artifact c3f4e8e9
(label reintegration-review): 15 new tags + ~435 folds by section + 113 on-hold, every placement
revertible. User walks it and issues vetoes/redirects as amendments before we proceed.
**⏭️ THEN: final missed-≥3 sweeps → placement review (all flags) → COMPREHENSIVE RETHINK →
adapter work.** Superseded record: (was: RESIDUE WAVE 1 — BANKED (2026-07-23, user-approved + 18 deltas). ZERO LINGERING ACHIEVED:
every keyword ≥3 in the corpus is now a canonical member, an excluded.json rule, or an excluded.json rule. **LOOSE = ZERO** (affectation → cliché w/ may-not-be-best note).** State: 1,180 canonicals / 5,934 member strings /
1 loose / 626 excluded-by-rule (tag-rules/excluded.json, 10 categories). Deltas honored: amused 226
+ harsh 30 own Mood tags · 1930s dissolved→great depression 93 · mature→excluded (mindset) ·
concierge NEW [concierge,valet] · fossil fuels 22 + energy 10 split · jewelry 25 own · suppressed
past→amnesia · allies/liberation/invasion/stupidity→excluded (too broad) · neighborhood 13 own
Locations · comeback→ambition · retirement 30 own (+retiree/retired from elderly) · caretaker own ·
puppet moved→Objects & Weapons · superstition→supernatural. genius 54 rename resolved the fork.
**⏭️ NEXT (user-confirmed): walk the ENTIRE exclusion ledger (626) once more attempting
section/tag placements before it locks — then final missed-≥3 sweeps → placement review →
comprehensive rethink → adapter work.** SUPERSEDED wave record below: (was: BUILT, AWAITING RULINGS (artifact c3f4e8e9 label residue-wave-1; map
= scratchpad residue-map.json; renderer .residuerender.py): ZERO UNRESOLVED.** 18 NEW tags
(complex ~130 · contemplative ~90 [the philosophical pull-outs get their own home] · cliché ·
memory ~70 · culture clash · insecurity ~30 · sleep · housekeeper [user umbrella word] · wardrobe
· energy industry [resolves the oil family] · codebreaking · homecoming · gossip · midlife · dj ·
astronomy · evolution · great depression 21) + RENAME child prodigy→genius (+mathematics/
mathematician — resolves the genius fork) + 148 folds (amused→cheerful, cheating→dishonesty,
gold rush→american west, riddle→game, superstition+omen→paranormal, martyrdom family→sacrifice,
seppuku→samurai, exploitation-cinema family→grindhouse…) + **THE EXCLUSION LEDGER: proposed
tag-rules/excluded.json — 623 strings in 10 documented categories** (editorial-reactions, glue
words, elemental/object glue, body parts, crude, demographic descriptors, ethnicity adjectives,
film-name pollution, genre combos, process labels, held-decisions-respected) — extending the
genre-synonyms drop mechanism so an exclusion is an ASSIGNMENT-BY-RULE that re-applies on every
import. Many ⚑ flags overturn prior holds (hover anchors in the artifact). Bank on user rulings.

**OPEN DECISION (superseded) — LANDMARK TAG:** 35 candidate strings measured, 145f dedup if all pulled (list in
sweeps[] + the final-sort artifact): the white house 27 (washington dc), pyramid 10 (egypt), eiffel
tower 9 (france), mount fuji 6, empire state 6, golden gate 6, griffith observatory 6, world trade
center 6 (terrorism), great wall 5, area 51 5 (alien), alcatraz 5 (prison), + sub-floor scatter
(statue of liberty 2, big ben 1…). Trade-off: pulls fresh place/concept folds back out. User to
decide.

**LATEST: fertility restructure (2026-07-23):** masturbation tag dissolved (string back in
eroticism 217) · NEW `fertility` 16 (M&H) = sperm bank + sperm donor + dissolved infertility
(childlessness/sterility) + floor-waived fertility/artificial insemination/surrogate mother +
desire to have children (pulled from pregnancy, flagged)., in the
**4-pillar tree** (Feel · Setting · Story · Style & Format — 21 sections; pillar+section on every
canonical; `pillar_tree` at top level). 38 sweeps/records in `sweeps[]`. All audits clean.
**~1,415 keywords ≥3 still unswept — EVERYTHING ≥10 is now swept** (except held wealth/debt). The remaining pool is the 3–9 dust (~515 at 5–9, ~900 at 3–4), which stays unswept BY DESIGN — picked up opportunistically in the endgame reviews. Roadmap: ~3 shaped slices left (vices/materials · places+travel leftovers · format strays + head-cleanup), then the 10–29 band (~260 kw) as fast batch passes; the 3–9 dust is picked up during placement review, not swept.
Corpus pinned: 8,531 films, snapshot 2026-07-17.

**THE WORKFLOW (per domain sweep):** pull pool (kw≥3, not member/canonical/loose/dropped) → curate
clusters by hand (regexes over-match — always corpus-check ambiguous keywords via film co-tags) →
raw-inventory artifact (nothing pre-folded) → propose folds w/ dedup counts in chat → user rules →
bank with the standard validator (double/phantom/FOF/self-keyword/tree checks; free claimed keywords
from ALL current holders incl. loose; dissolve emptied canonicals) → recompute ALL counts →
`sweeps[]` record → regenerate read-only board (`.board2.py`) → republish board artifact
cc16cb4a-8fa8-49d7-baa4-9245c84d46b9 → stamp sweep artifact ✓ BANKED → document in DATA_SOURCING →
update memory. Scripts live in scratchpad `6a67ad93-…/scratchpad/` (`.score.cjs` scores proposal
JSONs; `.board2.py` regenerates the board; caches `kw-counts.json`/`film-kw.json`).

**RESOLVED:** `slice of life` 29 = own tag (Sub-genres & Styles) per user — the one anime term
kept granular on the film side (it crossed into film vocabulary: 20/29 anime + 9 live-action;
coming of age overlapped only 5/29).

**⏭️ STILL PENDING:** ① `wealth` 29 + `debt` 24 held in pool — user wants a **social-class
organization review** (social class 119 / wealth / debt / loose high-society milieu as one
decision). ② Household trio note: maid/housekeeper/butler — housekeeper maybe the umbrella term —
KEPT LOOSE deliberately, revisit. ③ **MAJOR-CITY ROLL-UP POLICY (sweep 23, user):** big cities roll into region tags FOR NOW (las
vegas → nevada, hong kong → china; tokyo/paris/london already inside their countries) —
**re-evaluate later as ONE set** (LA, NYC, las vegas, hong kong, tokyo, paris, london, etc). Also:
`healing` pulled out of redemption → loose (future recovery-tag candidate). ④ FUTURE FAMILY
RESOLVED (2026-07-22): `dark future` → dystopia 213; `future` 79 → LOOSE with
not-Era note (user: too broad across near/distant/current — if looped in later, into a co-tag
world like dystopia, never Era). near future 56 / distant future 17 untouched as the precise Era
pair. ⑤ MYTHICAL CREATURE RESOLVED (2026-07-22): mega-merge per user → **`mythical creature`
149f/24kw** (dissolved unicorn 6, goblin 3, ogre 8, troll 13, giant 11, mermaid 18, elves 18,
fairy 28, dragon 40 + pool minotaur/kraken/yeti + **floor-waived** sub-3 scatter: cyclops, siren,
banshee, medusa, griffin, centaur, pegasus, sphinx, gorgon, bigfoot, sasquatch). Row `note`
carries: evaluate pulling the big ones (dragon/fairy/mermaid/elves) back out at placement review.
`genie` dissolved → `wish` 33 (user suggestion).

**① SOCIAL-CLASS REVIEW — RESOLVED (Option B, 2026-07-22):** social class 125→82 (class-relations
vocabulary only + the two cross-class romance premises, flagged for forbidden-love consideration) ·
NEW `wealth` 98 (I&S beside it — the old-money-world shelf: wealth + wealthy/rich family +
rich/wealthy man + upper class + bourgeoisie + high society/playboy/gold digger rejoins) · money
+debt → 134 · capitalism +financial crisis +economics → 43 · repayment stays loose (revenge
corpus) · Characters untouched. **FOOD FOLD same day:** food 43→88 (+chocolate/cake/dinner/
vegetarian/pizza/ice cream/apple; tea+candy stay out per user).

**② FRANCHISE COLLECTIVE — RESOLVED (2026-07-22, fold-to-concept):** measured finding: harry
potter / star wars / indiana jones / batman etc have **ZERO keyword presence** — franchise
identity lives in TMDB `belongs_to_collection`, not keywords. **A real franchise shelf is
DEFERRED to adapter-side collection data** (future work). The accidental keyword pile folded to
concepts: james bond→spy · dracula+nosferatu→vampire · frankenstein→monster (user) ·
reanimation→scientist (user) · sherlock holmes→detective · robin hood→outlaw · king arthur+
camelot cluster→knight · daredevil→stuntman (user) · dceu→based on comic · street fighter→based
on video game · tramp→silent film · madagascar→cartoon · fairy-tale names→fairy tale · etc.
jekyll and hyde + versus ×2 stay loose.

**②b LANDMARKS — RESOLVED (2026-07-22, fold-to-place):** white house+pentagon→`washington dc`
(**RENAMED from washington dc, usa per user**) · eiffel tower+versailles+louvre→france · brooklyn
bridge+empire state+times square→new york · golden gate+griffith observatory→california · mount
fuji→japan · great wall→china · taj mahal→india · grand canyon→arizona · corpus exceptions:
area 51→alien, route 66→road trip · **NEW `waterfall` (Locations, per user)** = waterfall pulled
out of river + niagara falls (Superman-polluted for place).

**②c US REGIONS — RESOLVED (2026-07-22):** regions stay own Place tags, no umbrella (7 region
notes cleared). NEW new england 14 · appalachia 3 · american midwest 3; deep south→southern usa
28. **lingerie→eroticism** (clothing collective in progress — wardrobe proposal pending).

**CONCEPT WAVE 2 BANKED (2026-07-23):** sections 1+2 approved w/ 7 amendments — 22 NEW tags
(hilarious 119 · existentialism 46 [pulled raw string out of philosophical — tone-vs-theme] ·
therapy 28 · surgery · loyalty · sin · luck · oppression · antisemitism · outcast 23 · home
invasion 44 · border 22 · chinatown · iceland · advertising · biblical · peplum · meta · erotic
thriller · romantic drama · screenlife · academy awards) + ~230 folds. AMENDMENTS: nuclear
war/threat→nuclear weapons 64 · coffin+boarding house loose · RENAME priest→clergyman 80 · map
loose (exploration-family pending) · clique loose (more-negative-than-friendship pending) ·
RENAME independent film→indie film 85. **THE FINAL SORT IS BANKED (2026-07-23, user-approved + 27 deltas — see final-sort sweeps[]
record for the full delta list). CONSOLIDATION IS COMPLETE: every ≥3 string has a deliberate fate.**
NEW this wave: 16 tags (crude humor 38 · captivity 44 · corporation · tribe · counterculture ·
indigenous peoples · small person · masturbation · recovery · dissociation · claustrophobia ·
infertility · archery · j-horror · polynesia · lost civilization) + RENAMES exploration (ex-
expedition) · roaring 20s (ex-1920s, +prohibition era/jazz age from age of progress) · dishonesty
(ex-lie). ANSWERED: historic-rulers tag not viable (napoleon→france, cleopatra→egypt) · famous-
person label = biography already serves it · lds not viable (mormon 4→christianity) · winter/frozen
split not viable (~10f) · dwarf 15 = fantasy race, stays · czar→royalty (monarchy=royalty) ·
**LANDMARK tag = 112f/24 strings IF wanted (open user decision — would un-fold the fresh place
folds)**. REMAINING: landmark call · placement review (all flags) · COMPREHENSIVE RETHINK ·
adapter/promote work (display floors, collection-data franchise shelf). Superseded proposal
record below: — artifact c3f4e8e9 (label final-sort), map =
scratchpad final-map.json, renderer .finalrender.py. Covers EVERYTHING remaining (loose + pool
5–9 + 3–4 dust): **678 concept folds** (by section, before→after counts) · **12 NEW tags** (crude
humor ~30 · j-horror · corporation ~15 · tribe · captivity ~25 · polynesia · lost civilization ·
claustrophobia 13 · infertility · dissociation [user's own word for loss-of-sense-of-reality] ·
recovery [healing+rehabilitation per the user's recovery-candidate note] · archery) · **1 RENAME**
(expedition→exploration absorbing map/trekking/explorer per the user's map note) · **852-string
PERMANENT RESIDUE** (349 loose w/ reasons + 503 pool floor-protected). **19 ⚑ FLAGS** = placements
that overturn a prior user hold (hover anchors): apathetic←callous+mean spirited (user said
indifferent!) · knife←stabbing (weapon rule vs rejected murder fold) · visions→psychic ·
bar mitzvah→judaism · drinking blood→vampire · cave diving→scuba · roller coaster→amusement park ·
pool billiards→gambling · indian burial ground/attack→native american · jules verne→steampunk ·
patient→hospital · ladykiller→seduction · psychology→therapy · weather manipulation→super power ·
book store→library alignment · etc. Rulings then bank in waves. THE SUPERSEDED
PROPOSAL RECORD BELOW (kept for reference): (artifact
c3f4e8e9-06c5-4689-bc75-1f5d25e04c32, label concept-first-proposal): 23 NEW tags + 233 folds
AWAITING USER RULINGS. NOTHING from it is banked.** Method correction (user, 2026-07-22):
placements must be by CONCEPT against the board IA — co-occurrence is only for
sense-disambiguation, never for homing (the earlier engine version produced slacker→friendship
artifacts and was rejected). The authored concept map lives in scratchpad `concept-map.json`
(NEW: name→[pillar,section,members]; ASSIGN: dest→[members]) and renders via `.conceptrender.py`.
Highlights — NEW: hilarious 119 (Mood, own per user direction) · therapy ~22 + surgery ~14 (M&H)
· existentialism ~22 · loyalty 14 · sin · luck · oppression ~20 · antisemitism 8 (I&S, parallel
to racism/homophobia) · home invasion ~44 (Reconsider-box rejoin + break in) · nuclear war ~14 ·
outcast ~15 · border ~20 · chinatown · iceland · advertising ~15 · biblical · peplum · meta ·
erotic thriller 20 · romantic drama · screenlife (F&M) · academy awards (F&M). Folds incl.:
teen-* 5 strings → existing teen movie 33 · self-mutilation family → existing self-harm 14 ·
grave/tombstone/coffin family → cemetery · safe/vault/safecracker → heist · jack ryan + jason
bourne → spy (franchise precedent) · reverend/bishop/minister → priest · time paradox/warp/what
if → time travel · nudity ×3 → eroticism · place roll-ups (beverly hills→california,
jerusalem→israel, bahamas→caribbean, wild west→american west…). After ruling: pool 5–9 has ~270
unplaced strings for a second concept pass; 884 dust (3–4) deferred by design.

**WAVE 1 ALREADY BANKED (user-ruled, 2026-07-22):** Feel/Mood promotions witty 56 · playful 84 ·
whimsical 83 · lighthearted 59 · mysterious 46 · farcical→absurd · vampire hunter (slayer)→vampire
· asteroid→space · adult child friendship→child · missionary→religion · dying man→death · native
american reservation→native american · paranormal investigation→paranormal (user redirect).
REJECTED by user (stay loose, do NOT re-propose the same folds): hilarious→cheerful ·
frustrated→bitter · callous/mean spirited→cruelty (user: closer to *indifferent*) · relationship
· futuristic · stabbing · slacker · vhs · language barrier · matchmaking · instructive · kids on
their own · man child · tomboy · informant · book store · parasite.

**FLOOR DOCTRINE (answered 2026-07-22):** ≥3 fold floor is correct — 62% of member strings are
sub-10 and contribute 8,806 only-reachable-via-small-string film connections; dilution risk lives
in the 208 standalone <10f tags, which is a DISPLAY-layer (per-section floor) question at the
adapter, not a master.json problem. When scaling the corpus, treat the floor as a rate (~0.035%).

**②d SCIENCE partially resolved:** satellite→surveillance 65 (banked). **HELD per user:**
genius/child-prodigy rename+folds (mathematics, mathematician, genius, prodigy all untouched) ·
wardrobe label + clothing assigns + makeover. **③ MAJOR CITIES — RESOLVED: OPTION A, keep the
roll-up** (measured shares recorded in sweeps[] for the rethink: NYC=90% of new york, paris=67%
of france, london=71% of england, LA=60% of california; pull-out documented and declined for now).

**⏭️ IN PROGRESS — ④ FULL LOOSE REVIEW + COMPLETE POOL SURFACING (user: one comprehensive view,
not batches):** artifact `c3f4e8e9-06c5-4689-bc75-1f5d25e04c32` (full-review.html) shows ALL 486
loose entries (grouped: 81 bucket-era tone words = the Feel/Mood decision · 68 user-held w/ notes ·
148 polluted/glue · 189 other) + ALL 1,379 never-surfaced ≥3 pool keywords, auto-clustered by
corpus co-occurrence (1,106 have a ≥40%-share suggested destination canonical; 273 no signal).
Rulings happen against this surface in waves. Then ⑤ PLACEMENT REVIEW (all flags + held
genius/wardrobe forks) ⑥ COMPREHENSIVE RETHINK. (per-section pass with
all accumulated flags: game/Pursuits, identity trio, k-pop, weather+forces of nature in A&N,
mythical-creature pull-outs, housekeeper umbrella, recovery candidate, vision/psychic,
pop-star-vs-rock-star alignment, self-referential note, stock-market-in-Locations, romance
premises→forbidden love?) ⑤ **THE COMPREHENSIVE RETHINK (user, 2026-07-22):** after the flag-level
placement review, a full-master analysis — rethink where any tags may be better organized, whether
some need breaking out under new names, whether current groupings are the best fit. A deliberate
final pass over every assignment, expecting a few more decisions even after everything above.
Then the endgame: ① social-class org review (wealth 29 + debt 24 held) ② the 5 collective
decisions (landmarks incl. the white house 27 / grand canyon / golden gate bridge / brooklyn
bridge · franchise names incl. street fighter + nezha · science practices · clothing odds · US
regions) ③ major-cities re-evaluation ④ PLACEMENT REVIEW (all provisional homes + the
mythical-creature pull-out check + housekeeper umbrella + recovery-tag candidate + vision/psychic).

**NEW STANDING DIRECTION (sweep 17, user):** the film side maps anime genre terms onto
**film-native tags** instead of keeping granular anime vocab — Konomi has two mechanisms (anime
via AniList owns anime granularity; film via TMDB stays film-native). `anime` stays broad
(measured: granular fold would have added only +17f to anime 204). Precedent folds: shounen/seinen/
shoujo→anime · isekai→alternate reality · mecha→giant robot · ecchi→eroticism · magical girl stays
in magic · jidaigeki family→japanese epoch (Era). Apply the same mapping instinct to any future
anime-flavored keywords.

**OPEN COLLECTIVE DECISIONS (do not decide piecemeal):**
1. **Landmarks (~26)** — the white house, louvre museum, eiffel tower…, + versailles, griffith
   observatory. All loose/HELD.
2. **Franchise-name cluster** — james bond 21, dracula 19, frankenstein 13, madagascar 7, leatherface,
   bluebeard, blade runner, body snatchers, cinderella, pinocchio, tarzan, nosferatu, excalibur,
   daredevil… ONE decision (fold-to-concept vs umbrella vs own tags vs loose).
3. **Science-practice cluster** — mathematics, mathematician, astronomy, telescope, observatory,
   satellite (all loose by user call; scientist note marks it).
4. **Clothing odds** — dress, uniform, underwear, lingerie, bikini, glasses… (loose).
5. **US-region grouping** — southern usa, american west, new england… (7 region canonicals with
   notes + american midwest loose).

**STANDING RULES (beyond AGENTS/§9 basics):** genre-names DROPPED never folded (17) · exact corpus
strings, custom labels allowed (moviebiz, docufilm, animated, credits scene, female director,
railway, cowardly, arcade) · single home, NO facets — `note` field for two-faced tags · "Genre"
reserved for the TMDB layer → pillar is Style & Format · Characters not Cast (credits data coming) ·
dedup = union recomputed from film-kw · board is GENERATED (read-only, no drag) · positional notes
reviewable, integrity rules not · floor ≥3 (waivable by user for unambiguous species/strings) ·
fights split by weapon · vehicles = Settings, crashes = ONE crash event tag · practice folds into
person-tag (Model A) EXCEPT big practices (music, dance) and the loosed science cluster.

---

### Batch 2 — the 10–14 band (2026-07-22) · ✓ BANKED · EVERYTHING ≥10 SWEPT

134 keywords. **NEW (18):** SGS: character study 14 · medical drama 12 · wuxia 12 · neo-western 11
· religious horror 11 · spy thriller 11 · comedy of errors 10 — W&L: alternate history 12 ·
imaginary friend 14 · **paranormal 30 own per user (+paranormal phenomena rejoin)** — climate
change 19 (+global warming, environmentalism; A&N) — dementia 15 (+alzheimer's; M&H) — masculinity
11 (I&S) — hippie 14 (Characters) — expedition 12 solo (**exploration loose per user**) — power
outage 13 (Events) — chess 11 (Pursuits) — new hampshire 10 (Place). **~45 folds** incl. user
amendments: rapper→musician 138 (genres→music 122) · slaughter→massacre 57 · jew persecution +
adolf hitler→nazi 113 · kkk+racist+xenophobia→racism 109 · split personality+DID+mental
breakdown→mental illness 109 · pyramid+cairo→egypt 34 · orgy+bdsm→eroticism 158 · transvestism
×2→cross dressing · caper→heist · alter ego→secret identity · infiltration→undercover ·
bookshop→library · covid-19→virus. **User-loosed:** irish (ethnicity) · loss of sense of reality
(dissociation-adjacent) · social commentary · earth · hiking · **apple (Snow White corpus; food 43
exists w/ cooking/gastronomy if a food fold is ever wanted — small pool odds: chocolate 9, cake 7,
dinner 7, tea 7, candy 7, pizza 4, ice cream 4, vegetarian 8)** · exploration. Franchise pile +=
frankenstein, robin hood, sherlock holmes, king arthur. ~40 glue/tone words loose.
State: **1,108 canonicals / 4,619 aliases / 515 unassigned.** Clean.

---

### Batch 1 — the 15–24 band (2026-07-22) · ✓ BANKED

71 keywords, grouped approve/veto workflow. **NEW (22):** Themes: sacrifice 43 (bucket-5 rejoin +
self sacrifice) · justice 35 (+right and justice) · freedom 18 · fate 27 (+destiny) · teamwork 18 ·
moral dilemma 18 — mind control 29 (+brainwashing, W&L) — Objects: doll 22 (Chucky corpus: +evil
doll, killer doll rejoin) · diary 19 — juvenile delinquent 19 (Characters) — R&F: inheritance 15 ·
**pornography 21 own per user** — cross dressing 16 (I&S) — east asian lead 16 (F&M,
female-director precedent) — gas station 21 (Loc) — scuba diving 23 (Pursuits) — SGS: **pre-code
19** (the 1930–34 pre-Hays-Code label) · anarchic comedy 18 · sci-fi horror 17 · action comedy 17 ·
allegory 19 solo (**symbolism loose per user**) · **pov 16 own per user** (custom label).
**Adds (21 folds):** rock star→**musician** per user (pop star sits in singer — align at placement
review) · 9/11→**terrorism** per user · strip club→nightclub 56 · pedophilia+pedophile→child abuse
82 · vatican+pope→catholicism 75 · date+one-night stand→dating 122 · historical drama→historical
fiction · black humor→dark comedy · cover-up→conspiracy · emperor→royalty · pimp→prostitute ·
superhuman ×2→super power · supervillain→villain · lapd+policeman→police · false accusations→
falsely accused · flying saucer→alien · behind enemy lines→warfare · masturbation→eroticism ·
factual→informative · becoming an adult→coming of age · womanizer→seduction.
**Loose:** **great depression (user hold — NOT 1930s)** · **dceu → franchise decision per user** ·
james bond + dracula → franchise · symbolism · underground · retirement · single · exploitation
(labor sense, not the genre) · psychotronic · videotape · bite · futuristic · time · individual ·
repayment · 5 tone words (casual/approving/disapproving/apologetic/mean spirited).
State: **1,090 canonicals / 4,535 aliases / 464 unassigned.** Clean.

---

### Sweep 24 — Format Strays & Head-Cleanup (2026-07-22) · ✓ BANKED · ≥25 HEAD CLEARED

22 keywords / 538 mentions — the last shaped sweep; nothing ≥25 remains in the pool.
NEW: `historical fiction` 45 + `political thriller` 28 (Sub-genres; raw `historical` is
genre-dropped) · `informative` 32 (Feel/Mood, cautionary precedent) · `training` 42 (Pursuits —
montage corpus) · `interrogation` 26 (Events) · `resistance` 30 (War & Conflict — WW2 corpus,
beside rebellion/uprising) · `american football` 29 (Pursuits; basketball/baseball/boxing
precedent) · `letter` 28 (Objects). Grown: christmas 177 (+santa claus [24/24 co-occurrence]
+north pole) · coming of age 224 (+childhood) · survival +struggle for survival · philosophical
+philosophy · music +rock n roll · deafness 34 (+sign languages) · **nostalgic +childhood memory
(user)**. Loose: the white house (landmarks hold) · flying · intelligence · young adult ·
**vision (user — kept out of psychic)**. Also: **gold rush dissolved → age of progress 178
(user)**. State: **1,068 canonicals / 4,478 aliases / 445 unassigned.** Clean.

---

### Sweep 23 — Places, Travel & Urban (+ syndromes bonus) (2026-07-22) · ✓ BANKED

44 keywords / 408 mentions. **MAJOR-CITY ROLL-UP per user:** las vegas → nevada 45 · hong kong →
china 82 (policy: big cities live inside region tags for now; re-evaluate as one set later).
NEW Place: `europe` 28 solo (**scandinavia loose per user**) · `asia` 9 · `middle east` 12 ·
`caribbean` (custom label; caribbean sea 9 = Pirates corpus). NEW: `travel` 64 (Pursuits) ·
`suburbia` 15 solo (neighborhood stays loose per user) · `skyscraper` 15 (+high rise) · `riot`
17 (rejoin + street riots, Events). Grown: new jersey +atlantic city · stock market 22 (+wall
street) · racing +street race · california +san fernando valley · england +soho london · **railway
+london underground (user)** · world war +london blitz (user) · autism +asperger's · kidnapping
+stockholm syndrome · **mental illness +munchausen by proxy / disability +tourette +down syndrome
(user split)**. **street fighter → parked with the franchise-name decision per user.** Loose:
scandinavia · urban setting (superhero backdrop) · urban life/decay · megacity · mediterranean ·
tourists in peril · street war/life · bowling alley · brooklyn bridge (landmarks).
State: **1,061 canonicals / 4,461 aliases / 440 unassigned · 1,648 pool left.** Clean.

---

### Sweep 22 — Vices, Substances & Materials (2026-07-22) · ✓ BANKED

59 keywords / 463 mentions. NEW Pursuits: `marijuana` 58 (+pot smoking/stoner/weed/cannabis/
stoner comedy per user) · `psychedelics` 19 (lsd, hallucinogen family, drug trip, opium + the 1f
self-string; **raw `psychedelic` 5 → `surreal` per user with note** — it is the Jodorowsky
aesthetic, not the drug) · `smoking` 28 (+cigarette/cigar smoking/tobacco). NEW Objects &
Weapons: `gold` 34 · `diamond` 16 solo (**jewelry LOOSE per user**) · `poison` 31 (+poisoning
rejoin; weapons home per user). Grown: drugs 239 (+9 glue strings) · addiction 138 (+addict
family, junkie, overdose ×2, drug rehabilitation, **vice per user**) · **alcohol/alcoholism split
by composition** (user question answered): alcohol 115 (+drunkenness/drunk/liquor/moonshine —
substance/activity side) vs alcoholism 130 (+drunkard — the habitual-drinker person) · money 112
(+stolen/bag/suitcase money, cash, dollar, money problems, **prize money per user**) · fraud 47
(+money laundering) · drug dealer +drug mule · sickness +medication. Loose: jewelry ·
rehabilitation (mixed senses) · intoxication (Notorious) · pills/pill · adrenaline junkie ·
golden gate bridge (PotA + landmarks note). **RECOVERY answer:** no dedicated tag — redemption 55
holds `healing` (+forgiveness/reconciliation); therapy 9 loose; support group 5 pool;
recovery/sobriety/rehab sub-floor — candidate for a small `recovery` tag if wanted.
State: **1,053 canonicals / 4,432 aliases / 429 unassigned · 1,688 pool left.** Clean.

---

### Sweep 21 — Deception, Intimacy & Transgression (2026-07-22) · ✓ BANKED

50 keywords / 664 mentions. NEW Themes: `lie` 54 · `manipulation` 47 (+gaslighting per user,
+manipulative woman rejoin) · `deception` 42 · `voyeurism` 47 (Themes per user). NEW
Relationships & Family: `incest` 41 (home per user) · `virginity` 36 · `opposites attract` 27 ·
`polyamory` 9 rejoin. NEW Identity & Society: `sexuality` 44 (home per user) · `homophobia` 25
(parallel to racism). NEW Events: `sexual abuse` 49 (beside rape 100). NEW Sub-genres:
`psychological drama` 44 (beside psychological thriller 81). Grown: betrayal 130 (+double cross
×2) · age-gap relationship 73 (+age difference) · transgender 15 (+the dated transsexuality/
transsexual strings) · eroticism +threesome · coming out +in the closet · seduction +seducer ·
cruelty +sexual sadism/sexual torture (per user). Free wins: alternative reality→alternate
reality 123 · time-manipulation→time travel · internal affairs→police · trick or treating→
halloween. **Loose per user: cheating** (mixed infidelity/exam senses) · **sexually transmitted
disease** · hustler (split corpus) · weather manipulation · religious hypocrisy · tricks.
State: **1,047 canonicals / 4,376 aliases / 425 unassigned · 1,747 pool left.** Clean.

---

### Sweep 20 — Speculative Worlds, Creatures & Powers (2026-07-21) · ✓ BANKED

45 keywords / 581 mentions — the last big Worlds & Lore block, led by the two biggest pool
strings left.

**The big fold:** `monster` 152 → **228** (+creature 98 — corpus-checked as the monster-movie glue
word: alien 28, monster 22, animal horror 19, shark co-tags).

**NEW Worlds & Lore:** `giant creature` 46 (the menagerie: giant spider/insect/ape/worm/snake/
lizard/animal/crocodile/crab/octopus + giant creature — sits beside kaiju 37) · `fantasy world` 37
· `transhumanism` 23 · `wish` 28 (+wish fulfillment/wishes come true/wishes) · `invisibility` 19
(Hollow Man through the LOTR ring; +invisible man rejoin) · `maze` 15 (+labyrinth + the Italian
`labirinto` 8 string) · `shrinking` 11 (+miniaturization, miniature people) · `troll` 13 SOLO ·
`ogre` 8 (Shrek) · **`goblin` 3 SEPARATE per user** · `giant` 11 (fairy-tale giants, distinct from
the menagerie).

**NEW Sub-genres & Styles:** `dark fantasy` 41 · `lovecraftian` 23 (Evil Dead/book-of-the-dead
cluster) · `folk horror` 22 (occult/forest/witch).

**Grown:** royalty +kingdom → 162 (19/27 co-occurred) · time travel +changing the past or future ·
england +united kingdom · drugs +magic mushroom · eroticism +sexual fantasy.

**Loose per user:** beast 8 (Beauty-and-the-Beast × X-Men mix) · turn of the century (kept out of
1900s) · hope for future · conquest. **HELD:** future 79 + dark future 3 (future-family analysis —
see pending) · minotaur 4 (mythical-creature question — see pending).

State (post-amendments): **1,035 canonicals / 4,317 aliases / 423 unassigned.** Clean.

---

### Sweep 19 — Nature, Weather, Seasons & Disasters (2026-07-21) · ✓ BANKED

74 keywords / 810 mentions — the biggest coherent Setting block left.

**Seasons → Setting/Era (beside christmas):** `winter` 94 (winter + the whole snow family:
snow/snowstorm/blizzard/snowed in/snowman/avalanche — winter×snow overlapped only 9 films, one
shelf per user) · `summer` 30 · `autumn` 7 · `spring` 11 (+spring break per user).

**RENAME:** `disaster movie` → **`disaster` 78** (user) — absorbed disaster 45, natural/
environmental/human made disaster, catastrophe; stays Sub-genres & Styles.

**Weather → Story/Animals & Nature (user-approved home):** `storm` 46 (+thunderstorm, storm at
sea, sandstorm, rainstorm — KEPT separate: weather-mood, not catastrophe) · `fog` 13 (+mist).
`rain` 25 loose (pure atmosphere). **AMENDED same day: the granular disaster tags (earthquake,
tsunami, flood, hurricane, tornado, volcano) were first banked separate, then MERGED per user into
NEW `forces of nature` 110 (Animals & Nature)** — plus natural disaster + environmental disaster
pulled from `disaster` (→64, now the genre/human-made side: disaster movie, human made disaster,
catastrophe) and avalanche pulled from `winter` (→89). The 1-film raw `forces of nature` string
was corpus-checked (environmental documentary, not the rom-com) and claimed as self-keyword.

**Setting:** `countryside` 100 (+rural area, rural setting, rural, isolated farmhouse — overlap
was only 8/94) · **NEW `ocean` 29 (+atlantic ocean, user)** with `sea` taking only seaside → 64 ·
mountain +himalaya/alps/rockies/andes → 74 · jungle +amazon rainforest 56 · arctic
+antarctica/iceberg 14 (polar umbrella) · lake +pond · river +waterfall (rejoin) · farm +harvest.

**Activities & events:** `camping` 26 (Pursuits; +camping trip, campfire) · climbing
+mountaineer/mountaineering · `fire` 40 (Events & Actions; arson stays loose for the crime
neighborhood) · firefighter +firefighting · volcano +volcanology.

**Loose:** rain · wind/windmill · lightning ×2 · picnic · moor · **grand canyon → landmarks
collective decision** · fireworks · fire engine/fireplace/person on fire · sunrise/sunset ·
eclipse + solar eclipse (Apocalypto-family).

State (post-amendment): **1,031 canonicals / 4,276 aliases / 419 unassigned · 1,841 pool left.** Clean.

---

### Sweep 18 — Occupations & Person-Types (2026-07-21) · ✓ BANKED

64 keywords / 685 mentions. The Characters section held 141 tags; this closed the leftovers and
caught big strings the People sweep missed.

**Big adds:** `police` 454→**499** (+police officer 42, u.s. marshal, marshal — Fugitive manhunts
+ western lawmen both) · `child` 53→**93** (+kids 42) · `gangster` →**328** (+hoodlum 28) ·
`biography` →**356** (+historical figure 26) · `criminal` →**137** (+ex-con 33) · `politician`
→**161** (+mayor 19, corrupt mayor; **governor LOOSE — Pirates pollution**, its 8 films are
Governor Swann pirate films) · `betrayal` →**115** (+traitor 24) · `singer` →**117** (+pop star
23) · `school` →**413** (+scholarship, athletic scholarship, dean) · `royalty` +heir to the
throne · `nanny` +governess (Sound of Music) · `driver` +chauffeur (Sabrina) · `prison` +warden ·
`homelessness` +beggar · `banker` +broker · `moviebiz` +projectionist.

**NEW (Story/Characters):** `millionaire` 33 **solo** (user) · `tycoon` 27 = tycoon + billionaire
(**user split: romance-wealth vs mogul-wealth**) · `adventurer` 31 (Indy/Uncharted cluster) ·
`cheerleader` 12 (+cheerleading, cheering crowd) · `heiress` 10 (own for now; ~3/10 Lara Croft).

**User calls — kept loose:** the household cluster (maid 17 / housekeeper 12 / butler 9 / valet 4
— noted: *housekeeper maybe the umbrella term later*) · insurance agent (Double Indemnity noir) ·
busker · missionary · caregiver (Intouchables cluster) · high society 11 / playboy 11 / gold
digger 7. Also loose: tramp 6 (**the Chaplin persona**) · kids on their own 8 (Home Alone) ·
medical examiner · night watchman (Night at the Museum) · tax collector · locksmith · collector ·
shepherd (german shepherd = the dog, untouched) · interpreter · concierge · landlord · realtor ·
insurance · construction ×2 · the oil family (oil 8 = There Will Be Blood cluster).

**HELD in pool:** `wealth` 29 + `debt` 24 (pending the social-class organization review) ·
`clerk` 9 + `salesclerk` 4 (pending user's look at workplace).

State: **1,021 canonicals / 4,217 aliases / 405 unassigned.** Clean.

---

### Sweep 17 — Anime Vocabulary → Film-Native Mapping (2026-07-21) · ✓ BANKED

31 keywords / 300 mentions. **The strategic ruling:** anime granularity lives on the AniList side;
the film tree maps anime terms to film-native concepts. Measured first: folding the whole lexicon
into `anime` would add only +17 films (shounen 54/55, seinen 9/9, shoujo 7/7, ecchi 5/5 already
inside anime 204) — so the folds cost ~nothing in coverage and granular terms aren't needed on the
film side.

**Folds into existing:** shounen + seinen + shoujo → `anime` 205 · isekai → `alternate reality`
103 · mecha → `giant robot` 38 · ecchi → `eroticism` 126 · **magical girl STAYS in `magic`**
(ruled) · jidaigeki + bakumatsu + shinsengumi + ishin shishi → `japanese epoch` 54 (Setting/Era) ·
ronin → `samurai`.

**NEW:** `tokusatsu` 19 (+henshin heroes; kaiju overlap 17/18 noted, kept distinct — production
form vs monster) · `compilation` 26 (Format & Medium; anime recap films — based on tv series 21) ·
`donghua` 4 (Format & Medium; "distinct and unique format" per user — the Ne Zha films) · `k-pop`
10 (Story/Pursuits; **idol group loose per user**, girl group stays loose) · `high fantasy` 14
(Sub-genres & Styles, beside sword and sorcery) · **the film-movement family** (Sub-genres &
Styles, giallo/spaghetti-western precedent): `expressionism` 12 (**main name per user**, german
expressionism folded in) · `new wave cinema` 6 (**custom label** — raw `new wave` 1f is a
post-punk concert film; holds french + japanese new wave) · `neorealism` 4 · `dogme 95` 4 ·
`mumblecore` 3 · `grindhouse` 3.

**RENAME:** `anthropomorphism` → `anthropomorphic` 77 (user call; +raw anthropomorphic).

**Loose:** idol group (kept out of k-pop) · nezha → parked with the franchise-name collective
decision. `animation` 9 turned out to be genre-dropped (TMDB genre name, same as adventure/
mystery). **`slice of life` 29 = own tag** (Sub-genres & Styles) — resolved per user.

State: **1,016 canonicals / 4,188 aliases / 380 unassigned.** Clean.

---

### Sweep 16 — Narrative Devices, Structure & Premises (2026-07-21) · ✓ BANKED

The story-device layer of the long tail: 152 keywords / 2,447 mentions inventoried, 35 NEW
canonicals, 12 existing grown, 3 cross-pulls out of existing tags.

**Structure → Style & Format/Sub-genres & Styles:** `flashback` 114 (+told in flashback) ·
`whodunit` 63 (loose rejoin from the old Reconsider box) · `multiple storylines` 29 (hyperlink
films — distinct from nonlinear AND anthology) · `breaking the fourth wall` 29 · `fish out of
water` 30 (comedy premise) · `storytelling` 16 (+story teller, bedtime story) · `plot twist` 7
(**`twist` 5 = Oliver Twist pollution** — england/class/diary co-tags — loose with note).

**Mind & Health (altered states — the Bucket-5 loose pile largely rejoined):** `dreams` 98
(literal dreaming, corpus-checked: Elm-Street cluster, NOT aspirations) · `nightmare` 68 (rejoin;
**+nightmare becomes reality per user**, kept separate from dreams) · `amnesia` 69 (rejoin,
+memory loss; mutual co-tag 10/27) · `hallucination` 47 (rejoin; **reality vs fantasy kept loose
per user**) · `hypnosis` 19 · `coma` 22 (rejoin).

**Events & Actions (the device block):** `rescue` 123 (6 kw incl. rescue team + rescue from
drowning rejoins) · `escape` 135 (+attempt/plan; **+prison escape pulled out of `prison` per
user**) · `secret identity` 154 (**fake identity + new identity + witness protection + identity swap merged
in per user** — one identity-concealment tag; dual/double identity, hidden identity, double life too) ·
`mistaken identity` 24 solo (wrong-man/comedy device) · `falsely accused` 46 (+framed, framed for
a crime; **+framed for murder pulled out of `murder` per user**) · `missing person` 87
(+disappearance, mysterious disappearance, search party/missing husband/missing wife rejoins;
missing body stays loose) · `chase` 81 (+foot chase, pursuit) + `cat and mouse` 15 separate
(duel-of-wits; detective/serial-killer corpus) · `quest` 62 (+journey, journey around the world —
both fantasy-corpus) · `treasure hunt` 39 (+treasure, scavenger hunt; **riddle loose per user** —
split treasure/serial-killer signal) · `death game` 35 (death game/death match/deadly game rejoins
+survival competition; **mind game → `game` per user**) · `competition` 61 (+contest, tournament
per user) · `race against time` 41 (+countdown) · `trapped` 33 · `stranded` 22 (+marooned,
castaway) · `saving the world` 58 (+save the day) · `transformation` 60 (+radical transformation,
metamorphosis; alien/superhero/magic physical change) · `good versus evil` 88 (Themes) · `secret
society` 21 (Forces & Institutions).

**NEW `game` 58 (Story/Pursuits, per user):** game + trapped in a game + mind game + puzzle +
puzzle box + clue (amended in per user) + **board game + based on game pulled out of `based on
video game`** (which keeps `based on video game` +
`video game` as the adaptation tag). Home = Pursuits is my call — flag for placement review.

**Feel/Mood:** `cautionary` 60 (+cautionary tale) — corpus co-tags are pure tone words
(audacious/anxious/grim), not Format. `instructive` loose (docs-y).

**Grown:** spy 199→211 (+secret mission, top secret; **covert operation loose per user**) ·
social class 66→119 (+class differences, class, class society, class conflict, rich vs poor,
upper class) · alternate reality 79→95 (+parallel world; isekai left for anime sweep) · on the run
113→119 (+hunted) · ambition 59→72 (+big dreams, life's dream, dreamer; **american dream loose per
user** — aspirational sense) · loner 20→32 (+lone wolf) · gambling 68→76 (+wager — Pygmalion-bet
premises) · school 401→409 (+education) · self-discovery 95→99 (+quest for identity, self
identity) · time travel 130→133 (+journey in the past) · asylum 45→48 (+escaped mental patient) ·
desire (+dream girl per user — joins "man of one's dreams").

**Loose with notes (~37):** twist (polluted) · riddle · covert operation · origin story (stays) · reality
vs fantasy · american dream · the vague secrets pile (secret, dark secret, secret past/history,
hidden truth/past/agenda, hiding) · secret base/passage/passageway/lab/formula/code · mission 38
(broad) · booby trap · entrapment · sleepwalking/sleep/deja vu · trekking
· plan/plan gone wrong/scheme · search phrases · tale/ghost story/unreliable narrator/cliffhanger ·
**versus + versus fighting → parked with the franchise-name collective decision** (crossover-brawl
films, same 5 films).

State: **1,004 canonicals / 4,161 aliases / 378 unassigned.** Clean (post-amendment: identity
swap → secret identity 154; puzzle/puzzle box/clue → game 58).

---

### Sweep 15 — Holidays, Occasions & Supernatural (2026-07-21) · ✓ BANKED

NEW: `holiday` 129 (Era; dissolved the 4-film holiday season canonical; +holiday horror/comedy) ·
`occult` 77 (W&L; **paranormal phenomena, superstition, omen left loose** by user) · `satanism` 61
(W&L; **`devil` 26 = Satan-figure films, corpus-checked: only 9/26 overlap the demon family — demon
111 untouched**) · `party` 52 + `birthday` 26 + `prom` 15 (Events) · `vacation` 48 (Era).
Into existing: `religion` 163 (+god, miracle, crucifix, crucifixion, prophet) · `psychic` 94
(+premonition, precognition, clairvoyant, medium, tarot cards, séance, spiritism) · `haunting` 86
(+apparition, poltergeist) · `mythology` 59 (+norse god, god of thunder, demigod) · `school`
+graduation · `activism` +demonstration · `civil rights` +black panther party · `prison` +devil's
island. **anniversary left loose** by user (not into wedding).
Loose: search party (missing-person cluster), free spirit, daredevil, haunted by the past.
State: **970 canonicals / 4,049 aliases / 356 unassigned.** Clean.

---

### Sweep 14 — Body & Appearance (2026-07-21) · ✓ BANKED

NEW: `mask` 68 (Objects & Weapons — resolves the parked pig/animal mask pile, +masked man loose) ·
`doppelgänger` 41 + `body swap` 20 (Worlds & Lore) · `beauty` 32 (Themes; +beautiful woman/pretty
woman loose rejoins) · `disguise` 31 (Events) · `disfigurement` 28 + `plastic surgery` 17 (Mind &
Health; **eye operation loose** per user) · `tattoo` 17 (Objects & Weapons).
Into existing: `gore` 201 (+severed/disembodied hand, eye gouging, body mutilation, exploding body;
**hook for a hand loose** per user) · `disability` 74 (+wheelchair, wheelchair user) · `execution`
52 (+electric chair) · `film in film` 51 (+story within the story).
Loose/HELD: leatherface, bluebeard, body snatchers → franchise cluster · disappearance ×2 →
missing-person cluster (pool) · foot chase → chase cluster (pool) · clothing odds (dress, uniform,
underwear, lingerie, bikini, glasses…), blonde, oscar winner, body parts odds.
**Also this sweep: astronomy/telescope/observatory pulled back OUT of scientist → loose** (user),
held with mathematics/mathematician/satellite as the science-practice cluster.
State: **964 canonicals / 3,992 aliases / 349 unassigned.** Clean.

**⏸️ NEXT: sweep 15 — holidays & occasions + supernatural leftovers** (two small domains, ~53 kw:
holiday 111, birthday, prom, graduation + occult 33, ritual, curse, séance, voodoo…), then the
long-tail thematic slices (narrative devices first: flashback 96, dreams 80, good versus evil 88,
rescue 76, chase 58, secret identity 57, saving the world 56, transformation 55…). Placement
review LAST.

---

### Sweep 13 — Tech & Science (2026-07-21) · ✓ BANKED

**Line drawn: real-world tech/science vs sci-fi lore** (lore stays Worlds & Lore). NEW: `experiment`
101 (Events; all experiment strings + research) · `technology` 50 (F&I, +man vs machine loose) ·
`computer` 48 + `phone` 38 + `radiation` 20 (Objects & Weapons) · `internet` 29 (F&I, kept separate
from social media) · `cybercrime` 22 (Events; computer virus = digital kind) · `nasa` 20 (F&I;
**satellite left loose** by user) · `implant` 11 + `hologram` 11 (Worlds & Lore) · `arcade` 8
(user label: arcade + pinball machine, Locations) · `dam` 9 (Locations).

**Into existing:** `scientist` 137 — UNCHANGED in the end: astronomy, telescope, observatory **also pulled loose by user amendment**, held with mathematics, mathematician, satellite (whole science-practice cluster loose for later evaluation) · `alternate reality` 79 (+simulation ×2) · `cyberpunk` 47
(+cyber thriller) · `inventor` 37 (+invention) · `laboratory` 32 (+research station) · `genetic
engineering` 27 (+genetics, dna, GMO) · `clone` 27 (+cloning) · `weapons` +drone · `religion`
+scientology · `anti war` +conscientious objector · `musician` +saxophone · `food` +gastronomy.

**Loose:** satellite, mathematics, mathematician (user) · nuclear power plant, vending machine,
gadget, electricity, quantum mechanics, cryptography, neurosis · griffith observatory → HELD
(landmarks). State: **956 canonicals / 3,959 aliases / 327 unassigned.** Clean.

**⏸️ NEXT: sweep 14 — body & appearance** (~47 kw: mask 49, beauty, tattoo, hair, scar, costume…),
then holidays & occasions, supernatural leftovers, then the ~2,000 long tail in thematic slices
(narrative devices: flashback 96, dreams 80, rescue 76, chase, secret identity…). Placement review
LAST.

---

### Sweep 12 — Weapons, Objects & Fights (2026-07-21) · ✓ BANKED

**NEW Story/Objects & Weapons section** (the dissolved Subject & Event's successor for concrete
things): `gun` 163 (+bullet wound; 21 gun strings) · `explosion` 121 (+car fire/explosion strings,
time bomb, bomber, bomb shelter — both corpus-ambiguous, user routed here) · `weapons` 112 (minors
umbrella, animals-style: chainsaw, ax, whip, taser, flamethrower, archery cluster, armor + the
parked re-org pile: tank, combat drone, rocket launcher, land mine, mine field, lasers) · `sword`
108 (sword-fights live with the sword) · `nuclear weapons` 51 · `knife` 32.

**Fights split by weapon (user: "split is better"):** sword fight/swordplay→`sword` ·
gunfight/gun fight/gun battle→`shootout` 144 · fistfight/brawl/catfight→**`fight` 199, which
absorbed the `combat` and `hand to hand combat` canonicals** · `battle` 102 (+battlefield, siege,
ambush, rampage) · `duel` 55 (+showdown) · `manhunt`→`on the run` 113 (its fugitive/man hunt
family) · `gunslinger` 28 (+gunfighter).

**Cross-section:** weapon of mass destruction + biological weapon → `warfare` 56 (with its germ/
chemical warfare members). `blade runner` → HELD with the franchise-name cluster.

This sweep resolved BOTH parked piles (the Bucket-5 fight cluster and the re-org weapons pile) —
**unassigned dropped 348 → 319.** State: **944 canonicals / 3,896 aliases / 319 unassigned.** Clean.

**⏸️ NEXT: sweep 13 — tech & science** (~47 kw: computer 33, technology 29, internet 20, nasa 20,
experiment 57, virus already banked…), then body & appearance, holidays, supernatural leftovers,
then the long tail. Placement review LAST.

---

### Sweep 11 — Vehicles & Transport (2026-07-21) · ✓ BANKED

**The crash decision (Option B):** ONE **`crash`** tag in Events & Actions — **197 films** — holding
the entire crash/wreck/accident family (car crash 50, car accident 45, shipwreck 21, airplane crash
15 … + ten 2f sub-floor strings, floor waived). Vehicles stay clean settings; a plane-crash film
carries `airplane` + `crash` across two axes — the pillar model working as intended. `shipwreck`/
`boat accident` moved out of ▲ship into it. **`accident` 16 left loose — corpus-verified broad**
(surfing/cave/riding/industrial mishaps, only 2/16 vehicular).

**New Setting/Locations vehicle tags** (ship/railway/submarine precedent): `airplane` 98 (+flight,
aviation, flight attendant, airship, parachute) · `train` 74 · `car` 74 · `motorcycle` 44 (+biker) ·
`helicopter` 43 · `truck` 23 · `taxi` 21 · `bus` 10 · `bicycle` 9 · `ambulance` 8. `submarine`
moved Place→Locations (hygiene).

**Into existing:** `ship` 130 (sailboat, riverboat, steamboat, houseboat, rowboat, canoe, gondola,
cruise) · `road trip` 138 (+hitchhiker/hitchhiking) · `racing` 63 (+car race, race car, nascar) ·
`spaceship` 82 (+rocket, space shuttle) · `sea` +voyage · `navy` +aircraft carrier · `air force`
+fighter jet · `cowboy` 30 (+cattle drive, corpus=westerns) · `mine` +mining accident (2f, user).
New `sailing` 20 (Pursuits).

**HELD / loose:** `madagascar` = the animated franchise (not geography) — held with the
**franchise-name cluster** (james bond 21, dracula 19, frankenstein 13, cinderella, pinocchio,
tarzan, nosferatu, excalibur…) for ONE collective decision, like the landmarks · `transporter` 15
loose (polluted TMDB tagging — it sits on the Rocky films) · versailles → HELD with landmarks ·
car fire/explosion/exploding car → held for a future explosion cluster · sleigh, horse carriage,
balloon, hot air balloon, traffic jam loose.

**State: 937 canonicals / 3,808 aliases / 348 unassigned.** All audits clean.

**⏸️ NEXT: sweep 12 — weapons & objects** (~59 kw + the parked pile: gun 51, sword 40, tank 13,
nuclear weapons 11, knife 19, shotgun 24, combat drone, rocket launcher…), then tech & science,
body & appearance, holidays, supernatural leftovers, then the long tail. Placement review LAST.

---

### Sweep 10 — Media & Performance (2026-07-21) · ✓ BANKED

**Model A locked: practice folds into the person tag** — photography→`photographer` 74,
painting/art/sculpture→`artist` 122, journalism/newspaper/interview/magazine→`journalist` 172,
piano/guitar/violin/songwriter→`musician` 111, poetry/children's author/typewriter→`writer` 174.
(Model B — standalone Pursuits — reserved for big practices only: music 80, dance 77.)

**New tags:** `moviebiz` 110 (custom label — hollywood + industry cluster, F&I) · `independent film`
82 (Sub-genres; absorbed the parked cinema-movements loose cluster) · `celebrity` 75 (Characters) ·
`filmmaking` 74 (Pursuits) · `television` 52 (F&I, +talent show) · `film in film` 45 (Sub-genres,
meta device) · `fame` 36 (Themes) · `burlesque` 34 (Pursuits: +cabaret, vaudeville, strip show) ·
`teen movie` 33 (Sub-genres) · `radio` 29 (F&I) · `social media` 29 (F&I) · `fashion` 24 (Pursuits) ·
`opera` 17 (Pursuits, incl. phantom of the opera).

**Other rulings:** `comedian` 46 took stand-up comedy · **`theater` moved Setting/Locations →
Story/Pursuits** (49) · `found footage` 91 (+hidden/handheld/subjective camera, photographic
evidence) · christian film→`christianity` (chosen over broader religion) · package film→`anthology`
· snuff film→`gore` · radio dj + banned film + talent → loose · louvre museum stays HELD.

**State: 925 canonicals / 3,720 aliases / 338 unassigned.** All audits clean.

**⏸️ NEXT: sweep 11 — vehicles & transport** (~75 kw: airplane 70, train 63, car crash 50,
helicopter 40, motorcycle 34…), then weapons & objects (+ parked tank/nukes/drone + gun/sword
loose pile), tech & science, body & appearance, holidays, supernatural leftovers, then the long
tail. Placement review LAST.

---

### Sweep 9 — Animals & Nature (2026-07-21) · ✓ BANKED (incl. prehistoric addendum)

**New Story/Animals & Nature section** — real animals are subject matter, not lore. Migrated
from Worlds & Lore: dog, animals, cat, shark, dinosaur. Now 36 tags:
`animals` 201 · `dog` 160 · `cat` 65 · `pets` 55 · `insect` 52 · `bird` 50 · `shark` 43 · `horse` 43 · `dinosaur` 40 · `nature` 37 · `talking animal` 36 · `animal attack` 36 · `ape` 35 · `bear` 31 · `wolf` 25 · `monkey` 23 · `snake` 20 · `mouse` 20 · `lion` 19 · `pig` 18 · `spider` 17 · `fish` 15 · `penguin` 14 · `animal cruelty` 14 · `elephant` 13 · `animal rights` 13 · `whale` 12 · `wildlife` 11 · `tiger` 10 · `fox` 10 · `crocodile` 8 · `rat` 8 · `rabbit` 8 · `prehistoric animal` 8 · `turtle` 7 · `alligator` 6

**Key rulings:** `ape` is the main tag over gorilla/orangutan/primate/chimpanzee (monkeys aren't
apes — `monkey` separate) · crocodile & alligator SEPARATE · minor species grouped into `animals`
201 rather than 3–8-film micro-tags · talking dog/cat/pig fold into their species; `talking animal`
36 keeps only generics · hunting/hunt/poacher → existing `hunter` (Characters) 40 · fishing →
Pursuits · `anthropomorphism` 74 + `animal horror` 45 → Sub-genres & Styles (anthropomorphism is a
story technique — may move to a Narrative Devices grouping later) · wolfman → `werewolf` (stays
Worlds & Lore) · `royalty` renamed from monarchy (Characters) · teddy bear/stuffed animal → based
on toy · `mustang` corpus-verified = horse; `robin` corpus-verified = DC character, NOT a bird
(loose) · idioms (fish out of water, cat and mouse, lone wolf, shaggy dog story) left in pool for
the narrative-devices sweep · lore cluster (creature 98, giant-X, shapeshifting family) left in
pool for a Worlds & Lore sweep.

**Prehistoric addendum:** `dinosaur` 40 (+t-rex, velociraptor + 4 sub-floor species, floor waived
by user) · NEW `prehistoric animal` 8 (mammoth, saber-toothed tiger, megalodon) · `prehistoric`
(Era) 27 (+prehistory, pleistocene) · `kaiju` 37 (+godzilla, king kong) · paleontology + extinction
loose · caveman untouched.

**State: 912 canonicals / 3,602 aliases / 345 unassigned.** All audits clean.

**⏸️ NEXT: sweep 10 — media & performance** (78 kw / 717 mentions: hollywood, filmmaking,
celebrity, movie business…), then vehicles & transport (75), weapons & objects (59 + parked
tank/nukes/drone + gun/sword pile), tech & science, body & appearance, holidays, supernatural
leftovers, then the ~2,200 "everything else" in thematic slices. Full placement review LAST.

---

## 🏛️ 4-PILLAR RE-ORG — adopted 2026-07-21, PROPOSAL STAGE

**The structure** (user + Google AI brainstorm, refined together): every canonical gets one
home in a 4-pillar tree. **Pillar = the question it answers; part-of-speech follows.**

| Pillar | Question | Sections |
|---|---|---|
| **Feel** (adj) | How does it feel? | Mood · Disposition |
| **Setting** (noun) | When/where? | Era · Place · Locations |
| **Story** (noun) | Who/what/why? | Characters · Events & Actions · Forces & Institutions · War & Conflict · Identity & Society · Relationships & Family · Mind & Health · Themes · Pursuits |
| **Style & Format** (noun) | What kind of film? | Sub-genres & Styles · Format & Medium · Worlds & Lore · Based On & Franchise |

**Locked decisions:**
1. **"Characters", never "Cast"** — credits (real cast/crew) join the corpus later and own that word.
2. **Ingest unchanged** — re-org touches only the grouping layer (`section`/`pillar`); folds (`members[]`), counts, and the raw→canonical mapping are byte-identical. The future adapter reads folds, not sections.
3. **Single home, NO facets field** — one canonical, one place in the tree. Two-faced tags use the existing `note` field (documentation, zero audit surface). All integrity rules unchanged: dedup-union counts, one-keyword-one-canonical, no fold-of-folds, exact strings, generated board.
4. **The word "Genre" is reserved** for the TMDB genre layer (100% coverage, separate ranking, source of truth, genre-synonyms stay DROPPED). The tag pool's pillar is "Style & Format"; sub-genres never roll up into genres.
5. **Positional rules are now REVIEWABLE; integrity rules are NOT.** Old "X firmly lives in Y" notes were written against the 26-section map and no longer bind — they are surfaced during review (all 35 canonical notes shown in the proposal artifact), weighed, and re-decided. If a sweep or re-grouping reveals a better tag/group match, take it, even against an old positional note.
6. **Board goes read-only** — drag functionality dropped; the next board is a scan-first reference.

**Status: ✓ APPLIED 2026-07-21.**
Full 885-canonical mapping: **655 mechanical block moves** (Tone→Feel/Mood, Setting·*→Setting/*,
People·*→Story/Characters, L&R→Relationships & Family, Thematic Anchor→Themes, Activities→Pursuits,
Sub-genre/Format/F&SF/Creatures/Based-on/Franchise→Style & Format) + **230 judgment calls** (Crime,
Society & Identity, Politics, Intelligence, Military, History & Conflict, Subject & Event, UNHOMED
dissolve into Story sub-sections) with **35 ⚑ flags** (biggest: death 447→Themes, police 454→Forces,
prison 249→Setting/Locations, revenge 323→Themes, cruelty 318→Events-or-back-to-sadistic).
**Artifact: https://claude.ai/code/artifact/72b6fa01-f3f3-4d46-82c1-cfa34634f491**
Review rhythm: rule section by section (start with Crime & Justice), then apply, then rebuild board,
then home the 332 loose into the finished tree, then resume sweeps into pillar sections.
Restore point if needed: `tag-rules/snapshots/master-2026-07-21-sweep8-checkpoint.json`.

**APPLIED — final decisions (2026-07-21).** All 35 flags ruled: drugs→Pursuits · police→Characters ·
revenge/conspiracy/exile/patriotism/government secrets/military life/witch hunt/teenage rebellion/
cruelty/death/betrayal→Themes · suicide/abuse/abortion→Mind & Health · slavery/apartheid/colonialism/
nazi/national history→War & Conflict · prison→Setting/Locations · orphan/prisoner of war/gangster/
psychopath→Characters · terrorism/activism/execution→Events · empire/soviet union history→Forces.
**Fold changes:** german democratic republic→cold war (96) · fascist→fascism (28). **Dissolved to
loose:** nudity (+2 members), tank, nuclear weapons, combat drone (pending a Weapons grouping with the
gun/sword/knife loose pile). laboratory corrected Place→Locations. `cruelty` stays Themes; if it ever
flips back to `sadistic`, it goes to Feel/Disposition.
**Verified rules (2026-07-21):** credits scene = duringcreditsstinger+aftercreditsstinger deduped 632 ·
female director holds woman director · docufilm/animated avoid the TMDB genre collisions · spin off is
its own tag · railway holds subway/train-station keywords · ancient egypt+greece live in historic
empire · washington dc, usa / vikings (norsemen) / second sino-japanese war (1937-45) / based on novel
or book are stored and displayed as exact full strings · 7 region canonicals (southern usa, northern
england, southern france, french riviera, australian outback, florida keys, american west) carry an
evaluation note — grouping undecided, american midwest loose · "upper is a character" could not be
matched to any tag (nearest: `upper class` 17, unswept) — OPEN, ask user.
**Post-apply state: 879 canonicals / 3,449 aliases / 338 unassigned · 4 pillars · 18 sections.**
Board regenerated READ-ONLY at cc16cb4a-8fa8-49d7-baa4-9245c84d46b9 (drag removed).

---

## 🏁 CHECKPOINT — 2026-07-21, sweep 8 complete (Tone/Emotion/Death bucketed)

**This is a preservation point.** A big structural change may follow; this marks the
state to refer back to / restore from.

- **State:** 885 canonicals · 3,455 aliases · 332 unassigned · 26 sections · 9 sweeps.
- **Immutable snapshot:** `tag-rules/snapshots/master-2026-07-21-sweep8-checkpoint.json`
  (sha256[:12] `868d8a6590bb`) + `MANIFEST-2026-07-21-sweep8.json`.
- **Restore:** `cp tag-rules/snapshots/master-2026-07-21-sweep8-checkpoint.json tag-rules/master.json`
- **Artifacts (published, durable):** drag board `cc16cb4a-8fa8-49d7-baa4-9245c84d46b9` ·
  bucket view `15f8e86f-1a93-4073-a816-96f8b3117a19` · raw inventory `7b6193b0-9dd8-4250-b5d2-d7ed910ee1bc`.
- **New this session:** the 5-bucket frame ([[project_konomi_tag_bucket_frame]]) and 4 new
  sections — Tone (22), Character Disposition (19), Thematic Anchor (9), Subject & Event (5).
- **NOT yet in git** — `tag-rules/` + `DATA_SOURCING.md` still untracked. A commit is the
  recommended durable restore point if the next change is large.

---

### ⏸️ RESUME HERE (updated 2026-07-20, post-review) — read this first

**Where we are:** Tag consolidation is deep in. **`tag-rules/master.json` is the
single source of truth** — **859 canonicals / 3224 aliases + 240 unassigned**,
`{canonical, section, count, members[]}`, validated clean (0 dup names, 0
double-folds, 0 fold-of-folds). Every `count` is a **deduped union** recomputed
from `film-kw.json`. A full **review pass** ran (see "Master rule file — BUILT"
below) — homes fixed, stale §9 prose corrected.

**Sections DONE (folded + in master.json):** Crime & Justice · Genre-synonyms
(dropped) · Sub-genre/Style · Fantasy/Sci-Fi · Creatures · Society & Identity ·
Politics & Power · **Love & Relationships (50)** · **People — Professions (62),
Archetypes (24), Roles (9)** · plus the §9-ledger folds (Tone, eras/Period,
Place, Military, Warfare/Atrocity, Intelligence).

**Sections NOT yet swept (do next):** **Place** (cities/countries/place-types —
164 keywords, the biggest named gap) · **Based on** (source: novel/true story/
comic — 32 kw but 2,696 mentions) · **Format** (b&w, anime, 3D, short film,
musical) · **Franchise/release** (sequel, remake, stingers) · **Period/decade** ·
**Tone** (a real sweep, not just the §9 prose folds) · **Animals & nature**.
Sweep each at the **≥3 floor**.

### ⚠️ Coverage reality check (measured 2026-07-21)

**3,857 keywords at ≥3 are still NOT on the board** (~37,700 raw mentions) — about
**61% of the ≥3 corpus**. (4,233 → 3,976 after the drag-board reconciliation →
3,857 after the Based-on/Format/Franchise sweep.) Do not read "9 sections
done" as "mostly done": the finished sections are deep, not wide. Breakdown of
what remains, by rough domain:

| Domain | keywords | raw mentions |
|---|---|---|
| everything else (long tail) | 3,800 | 37,014 |
| Place (city/country/place-type) | 164 | 2,959 |
| Based on (source) | 32 | 2,696 |
| Franchise / release | 10 | 1,978 |
| Format / presentation | 52 | 1,879 |
| Tone / mood | 17 | 1,318 |
| Period / decade | 25 | 1,040 |
| Animals & nature | 85 | 1,033 |
| Violence / death | 48 | 1,004 |

The high-mention/low-keyword domains (Based-on, Franchise, Format) are the
cheapest wins left: ~94 keywords carry ~6,500 mentions. `duringcreditsstinger`
(442) and `aftercreditsstinger` (345) are **TMDB metadata, not content** — expect
to DROP them like the genre-synonyms.

### 🚨 §9-prose gap — keywords invisible to BOTH the board and every sweep

The Society/Politics sweep excluded a hardcoded list of keywords on the grounds
that §9's prose said they were already folded. **16 of them were never actually
banked into master.json**, so they were skipped by every later sweep *and* absent
from the board — 757 raw mentions falling through the crack:

`suicide` 146 · `death` 137 · `survival` 117 · `fbi` 104 · `corruption` 95 ·
`espionage` 46 · `fascism` 27 · `revolution` 27 · `patriotism` 16 · `dictator` 13
· `apartheid` 6 · `anarchist` 6 · `socialism` 5 · `censorship` 5 · `nationalism` 4
· `democracy` 3

Same class of gap in **People · Roles**: §9 prose says warrior/samurai/pirate/
cowboy/gunslinger/ninja/outlaw/musketeer/barbarian/gladiator/knight moved there.
**None were banked** (~200 films). Tone has the same shape — `amused` (226),
`absurd` (159), `dramatic` (147), `intense` (141) are all still unswept despite
16 Tone canonicals existing.

**The love-people sweep back-filled 8 of these** where it needed them as parents
(`suicide`, `survival`, `rape`, `warrior`, `knight`, `prisoner of war`, `obesity`,
`nudity` — marked `"backfill": true` in master.json). **The rest are still open.**

**Rule going forward (locked):** an exclusion list for a sweep must be built from
`master.json` itself, never from prose. Prose is not a source of truth; if a fold
isn't in master.json, it didn't happen.

### 🔧 Integrity repair + board reconciliation (2026-07-21)

Two audits ran after the love-people sweep. Both found real damage; both are now
guarded by permanent checks in the audit script.

**Repair 1 — short-form member names (13 repaired, 6 removed).** §9-era folds
recorded member names in *short form*, dropping TMDB's date parentheticals, so
they matched **zero** films: `spanish civil war` is really
`spanish civil war (1936-39)`, `shōwa era` → `shōwa era (1926-89)`, `korean war`
→ `korean war (1950-53)`, `us soldier` → `u.s. soldier`. Six had no corpus match
at all and were removed. **Rule (locked): store the EXACT corpus string as the
member, never a short form or a tidied-up label.**

**Repair 2 — canonicals excluding their own keyword (59 fixed, +2,234 films).**
A canonical named `X` where `X` is itself a real keyword but was missing from its
own `members[]` — so those films were silently dropped. `biography` 4→253,
`suspenseful` 22→180, `christmas` 54→175, `spy` 126→197, `family` 194→351.
`france` and `england` were **empty shells at count 0** (their members had been
moved out in the review pass and the parent was never dissolved or repopulated) —
now 79 and 59.

This is NOT the genre-dilution rule. That rule (genre-name duplicates are DROPPED
entirely) was checked and is intact — **zero** of the 59 were in the dropped list,
and three (`spy`, `biography`, `family`) are in genre-synonyms' explicit KEPT
list. **Rule (locked): a canonical's own keyword is always a member, UNLESS it is
a TMDB genre-name duplicate.** The fix is guarded by that check so the dilution
rule can never be violated.

**Reconciliation — the drag board held 294 tags never banked to master.json.**
Whole boxes of decisions existed only in an HTML file: Based-on, Format,
Where·Place, When·Decades, Tone, Creatures, Activities. `credits scene` (632) is
one of them — a real, correct decision (`duringcreditsstinger` +
`aftercreditsstinger`, verified: 632 is exactly the dedup of the two) that lived
nowhere but the board. **252 were imported** (274 were exact single keywords; 5
board labels were short forms needing repair, e.g. `based on novel` →
`based on novel or book`). Two conflicts were correctly skipped (`school` was
already inside `high school`).

**14 tags are DEFERRED to their section sweep** — the board stores a rollup only
as an aggregate count, so their member lists are unrecoverable and must be
re-derived, not guessed: `franchise` 1007 · `new york` 425 · `california` 400 ·
`female director` 319 · `parent-child` 209 · `japan` 150 · `china` 82 · `texas`
80 · `music` 50 · `dancing` 30 · `egypt` 25 · `gambling` 25 · `cooking` 20 ·
`greece` 18. (`parent-child` is already covered by `parent & child` 566;
`female director` is the board's name for the unassigned `woman director`;
`egypt`/`greece` conflict with `ancient egypt`/`ancient greece` inside
`historic empire`.) Recorded in `master.reconciliations[].deferred_tags`.

**Rule (locked): master.json is the only source of truth.** Not prose, not the
drag board. The board is now **generated from** master.json (`.board.cjs` in
scratch) and must never be hand-edited — hand-editing is exactly what let 294
decisions live outside the system. The generator asserts that every canonical and
every unassigned keyword renders as a chip (777/777), and any section not
assigned to a band gets its own "needs a home" box rather than silently
vanishing. Board artifact: `cc16cb4a-8fa8-49d7-baa4-9245c84d46b9`.

**Label conventions (locked):** no `&`, no en-dash or em-dash in a canonical
label — plain hyphens only, since the label is a lookup key (`parent-child`,
`aunt-uncle`, `human-animal bond`). Where a label is a deliberate custom name
rather than a corpus keyword, record why in the canonical's `note` — e.g.
`female director` holds the `woman director` keyword because the counterpart term
is *male director*, not *man director*.

**Rule (locked) — never name a tag after a TMDB genre.** The Genre field is the
COARSE layer at weight 100 and is always shown, so a *tag* sharing a genre's name
renders as a chip that looks like a duplicate of the genre chip beside it.
Where a fold needs a label in that space, **rename it to something outside the
genre vocabulary** and record why in the canonical's `note`:

| Genre name (DROPPED as a keyword) | Tag label we use instead |
|---|---|
| `animation` | **`animated`** — holds the techniques and flavours |
| `documentary` | **`docufilm`** — holds documentary modes and subjects |

This is the naming counterpart to the membership rule ("sub-genres are the FINE
layer, never fold up into a genre"). The bare genre-name keyword stays DROPPED in
both cases; only the *label* changes. The self-keyword check (above) has an
explicit exception for these so the two rules cannot fight each other.

### Known missing parents (blocking specific keywords)

- ~~`vampire` (82)~~ — RESOLVED by the board reconciliation (it was a board-only
  tag); `vampire hunter (slayer)` can now be re-homed
- ~~`sports` (159)~~ — RESOLVED by the board reconciliation
- `death` (137) — one of the 16 above; broad enough to deserve its own decision
  rather than a side-effect back-fill. `dying man` (7) waits on it.

**The sweep workflow (proven):**
1. Regenerate scratch caches if lost (session-scoped): `kw-counts.json`
   (per-keyword film counts) and `film-kw.json` (per-film keyword sets, for
   dedup) — pull from Postgres `raw_tmdb_movies`, `select kw:payload->keywords`,
   PAGE=500, lowercase+dedupe names. (Env: NEXT_PUBLIC_SUPABASE_URL +
   SUPABASE_SECRET_KEY in `.env.local`; run `.cjs`/`.mts` from repo dir.)
2. Build a cluster script that **excludes members already in `master.json`**
   (this is what prevents re-folding — the bug we hit with §9 politics). Select
   the domain via regex, floor ≥3, cluster by fold-target, scrub noise.
3. Publish a clustered inventory artifact; also show **existing anchors** so the
   user can route new tags into them.
4. User names folds → compute **deduped** counts from `film-kw.json` (union of
   films with ANY member, never sum) → phantom-check members → apply to the
   drag board (mark rollups `,1`) → **run the board dedup scan** (grep uniq -d).
5. Bank into `master.json` (rebuild via the audit script `.audit.cjs`, which
   also re-validates) → document the section here.

**Live artifacts (Claude Code artifacts, same URLs on redeploy):** drag board
`cc16cb4a-8fa8-49d7-baa4-9245c84d46b9` · master audit
`a0d6621d-4117-4dae-9a83-15cc698d4ad3` · crime inventory
`85d8bdc5-1588-46bf-b521-0a80534d473a` · subgenre/fantasy
`57f374c0-232f-4d0d-9b91-22e8dc8e8788` · society/politics
`ad79694d-36c3-42f6-883e-18cca386d576`.

**Locked rules (don't relitigate):** dedup = union not sum · consolidate before
floor · floors deferred (decide at the very end, low ≥2–3) · genre-name keywords
are DROPPED not folded · sub-genres are the FINE layer, never fold up into a
genre · no duplicate canonical names, no double-folds (a keyword folds into
exactly one canonical) · every fold is a persistent adapter rule (raw untouched);
executable layer still DEFERRED until board fully stable.

---

### Current state & how to resume (step 3 — pruning, mostly manual)

**Per-section floor = ≥3** (agreed): when surfacing a category we show every
keyword in ≥3 films (skips the ~8,172 single-film noise; ~6,321 keywords total
at ≥3, a few hundred per section). Distribution: 17,331 distinct keywords, 47%
appear in exactly 1 film. Reusable caches in scratch: `kw-counts.json`
(per-keyword film counts), `film-kw.json` (per-film keyword sets, for real dedup).

1. **Crime & Justice — DONE (this pass).** 389 keywords at ≥3 → **38 canonicals**,
   27 still loose (fine — reconsider as other sections open). Full record with
   deduped counts + member lists + loose tail: **`tag-rules/crime.json`** (the
   first durable rules file — see "Planned next" below). Cross-section outcomes:
   `prison` (244) merged into **Setting·Place** (one prison, not two); `drugs`
   (187) merged into **Activities** (absorbs drug-crime tail); `detective` (242)
   canonical lives in **People·Spy/Law**; `police` absorbs `police corruption`
   (from Politics) + `undercover cop` (from People). Loose tail still in crime:
   home invasion, arson, riot, vandalism, gun violence, atomic bomb (→war?),
   whodunit (→sub-genre?), martial law (→politics), hate crime, money laundering,
   informant, stabbing, witness protection, etc.
2. **Genre-synonyms — DONE.** The TMDB genre field is authoritative (wt-100,
   every film). Keywords that merely duplicate a genre name (`romance`, `war`,
   `horror`, `adventure`, `comedy`… 17 total) add no specificity → **DROPPED**
   (never become tags), NOT folded — folding would manufacture a sparse duplicate
   of a signal we already have. KEPT the ones that share a name but carry distinct
   meaning / have no matching genre: `biography` (Based-on), `superhero`/`slasher`/
   `disaster` (sub-genres), `musical` (format), `family` (theme), `spy` (People).
   `biopic`→`biography`. Full list: **`tag-rules/genre-synonyms.json`**. Only board
   impact: `war` removed from Conflict.
3. **Sub-genre & Style + Fantasy & Sci-Fi + Creatures — DONE.** 272 keywords at
   ≥3 → **60 canonicals + 48 kept-distinct**. Full record:
   **`tag-rules/subgenre-fantasy.json`**. Key principle (banked): the TMDB genre
   field is the COARSE layer (wt-100); these are the FINE layer — **never fold a
   sub-genre up into its parent genre** (would duplicate the field), merge only
   true synonyms sideways (all gothic→`gothic`, all `alien *`→`alien`). Big
   canonicals: alien 231, superhero 235, martial arts 226, supernatural 224,
   magic 220, space 136, time travel 130, road trip 123, post-apocalyptic 121,
   monster 152, demon 111, witch 108. Cross-group routes at merge:
   alien/giant robot/zombie/monster/werewolf/kaiju/magical creature/mythical
   creature → **Creatures**; prophecy/chosen one → Fantasy tropes; santa's elves →
   christmas. Collisions resolved: `dark comedy` stays Tone, `found footage` stays
   Format, `space` stays Fantasy (removed from Place — flag: space is arguably a
   Setting like prison; revisit — later MOVED to Setting·Place, like prison).
3b. **Society & Identity + Politics & Power — DONE.** Society was never folded
   before (all new); Politics had **60 keywords already folded in §9** (politician/
   monarchy/election/capitalism/surveillance/conspiracy/spy/nazi/activism…),
   excluded so they weren't re-done. Added **65 canonicals**, record:
   **`tag-rules/society-politics.json`**. Splits for precision: LGBTQ
   (gay/lesbian/bisexual/transgender/coming out + `lgbt` umbrella), religion
   (per-faith + `cult` + `spirituality`), mental-health (trauma/depression/anxiety/
   self-harm/eating disorder + `mental illness`), abuse (bullying/child/domestic/
   `abuse`), race (racism/discrimination/interracial/civil rights). Cross-section:
   `immigrant` moved Politics→Society; `monarchy`/`politician` updated in
   People·Authority; `colonialism`/`dictatorship` in History&Conflict; `tyranny`
   (new) absorbed `totalitarianism`. Loose on purpose: euthanasia, identity, abuse
   of power, power abuse, state of emergency. **GAP that bit us:** §9's own
   politics/roles/tone folds are still prose-only — back-fill
   `tag-rules/politics.json` + `tone.json` so nothing gets re-folded again.
   Remaining tails: Professions, Love, Place-types, Roles.
4. **Love & Relationships + People — DONE (2026-07-21).** The biggest sweep so
   far: 971 keywords at ≥3 across 35 navigation boxes → **149 canonicals / 780
   aliases**, plus 2 amendments to existing canonicals and 47 keywords routed
   into anchors that already existed. Records: **`tag-rules/love-relationships.json`**
   (50 canonicals) and **`tag-rules/people.json`** (88 across Professions /
   Archetypes / Roles). Live inventory artifact:
   `ed2bb023-ebbd-4c28-b97a-bbd97678ebec`.

   **Structural outcomes worth carrying forward:**
   - **Professions + Roles/Archetypes merged into one People domain** — this
     settles the deferred §9 question. They were swept together because 43
     keywords collided across the two (a priest is both a job and an archetype);
     sweeping them apart kept stealing keywords from each other.
   - **TMDB dyads are not tags.** The `X Y relationship` family (56 keywords,
     1,520 mentions) collapsed: all four parent-child dyads → `parent & child`
     (566), brothers/sisters/twins → `siblings` (411), `husband wife
     relationship` → `marriage` (371). Professional dyads (co-workers,
     employer-employee, doctor-patient) went to their profession instead.
   - **Gender-qualifier rule (locked):** `female/male/woman/girl + <base>` folds
     into `<base>` (`female writer`→writer, `male friendship`→friendship). This
     is what made the 94-keyword "age & gender framing" box evaporate — it
     produced only 2 canonicals of its own.
   - **Descriptors of the production are not content tags.** `woman director`
     (319) is deliberately unassigned — it describes the filmmaker, not the film.
     Contrast `female protagonist` (135), which folded into a new `protagonist`
     canonical because it *does* have a real base tag.
   - **Sub-genre stays the fine layer.** romantic drama/thriller, sex comedy,
     erotic thriller and the whole `teen movie/comedy/drama/fantasy/horror`
     family were held for the Sub-genre reconcile, not folded into themes.
   - `betrayal` (95) is banked with section **UNHOMED** on purpose — it drives
     crime/war/spy films as much as love; placing it needs its own decision.

   **Process lessons (apply to the next sweep):**
   - **Run a completeness check, not just a validity check.** Validity (no
     phantoms/dups/double-folds) passed all the way through while 5 keywords had
     silently fallen out of the proposals. Assert that every keyword in the sweep
     set is a member, a route, a held item, or an explicit loose.
   - **Resolve stale pointers as you go.** A keyword parked as "pending → X" in
     an early box becomes a double-fold false-positive once a later box actually
     folds it; move it to `resolved_in_later_box` at that moment.
   - **Loose is a real destination, not a gap.** 125 unassigned keywords are now
     carried on the board in `master.unassigned` with a reason each, and belong
     in the drag board's **Reconsider** box (whose title still says "crime tail"
     and should be generalised).
5. **Based-on / Format / Franchise — DONE (2026-07-21).** 121 keywords at ≥3 →
   **21 new canonicals**, 60 keywords added into existing anchors, 3 amendments.
   Inventory artifact: `77417902-f9e9-4862-b7e9-b3340798fda0`.
   - **New `Franchise` section.** `sequel` (732) and `remake` (217) MOVED out of
     Source · Based on — a sequel is a release relationship, not a source. Joined
     by `prequel` 59, `reboot` 52, `spin off` 51. This also gives the board's
     deferred `franchise` rollup (1007) a real home.
   - **`3d animation` dissolved into `animated` (381)** — one technique among
     several; all animation techniques and flavours now sit in one tag.
   - **`docufilm` (68)** holds the documentary modes and subjects.
     `pseudo-documentary` / `faux documentary` / `fake documentary` moved to
     **`mockumentary`** (19 → 54) — they are fiction shot to look like a
     documentary, not documentaries.
   - **`biography` 253 → 342** absorbed the memoir/autobiographical/biographical
     family, deliberately kept OFF `based on true story`.
   - `live action` 106 (renamed from `live action and animation`, holds
     `live action remake`). `puppet` 21 moved to Creatures — a puppet is a
     character, not a presentation technique.
   - The genre-drop guard fired correctly during this sweep: applying
     `documentary` and `animation` as canonical names was REJECTED by validation
     because both are genre-name duplicates. That is what produced the naming
     rule above.

6. **Place · Location · Activities — DONE (2026-07-21).** 698 keywords at ≥3.
   - **The recorded city-fold rule was finally executed.** `master.json`'s
     `expression_note` had said `'city, US-state'→state` / `'city, country'→country`
     since the review pass, but it was never applied — which is why `france` read
     79 while `paris, france` (177) sat unfolded next to it. Applied ONLY to
     keywords with no extra context. Results: `new york` 425 · `california` 371 ·
     `france` 263 · `england` 226 · `italy` 162 · `japan` 150.
   - **Rule refinement (locked): context beats pattern.** A keyword carrying a
     second idea is NOT auto-folded — `german occupation of france` → `nazi`, not
     `france`; `pacific island` → `world war`; `remote island` → `prison`.
   - `state, usa` folds to the **state**, not `usa` (`pennsylvania, usa` →
     pennsylvania).
   - **NO LANDMARK RULE (decided 2026-07-21).** Named landmarks are NOT folded to
     their country. A landmark-in-city fold was briefly applied and then
     REVERTED — `eiffel tower, paris`, `mount fuji, japan`, `great wall of
     china`, `taj mahal, india` are all unassigned again. They join the 19 other
     named places (`the white house` 27, `louvre museum` 5, `golden gate bridge`
     6, `notre dame cathedral` 5, `sahara desert` 5, `grand canyon` 5,
     `auschwitz-birkenau concentration camp` 6 …) awaiting ONE collective
     decision: do landmarks fold to their country, or stand as their own tags?
     Do not fold them piecemeal.
   - **New section `Setting · Location`** — the kind of place (school, ship,
     island, bar), split from `Setting · Place` (where in the world). `high school`
     and `college` DISSOLVED into `school` (399).
   - Nationality words (`native american`, `italian american`…) went to **Society
     & Identity**, NOT folded into their country.
   - **19 named landmarks deliberately left undecided** (`the white house`,
     `louvre museum`, `golden gate bridge`, `sahara desert`…) — no rule yet on
     whether a landmark folds to its country or stands alone. `rhode island` was
     pulled out of that pile as a state.
   - **Activities & Pursuits swept** — `sports` 181 · `music` 80 · `dance` 77 ·
     `gambling` 68 · `concert` 61 · `alcohol` 91. This resolved the LAST four
     deferred board rollups.
   - **`alcohol` was pulled OUT of `alcoholism`** (161 → 129) to head the
     drinking cluster. Clean split: `alcoholism` is the disease (alcoholic,
     alcohol abuse, alcoholics anonymous), `alcohol` is the substance and the act
     (drinking, beer, wine, whiskey, underage drinking).

### ⏸️ RESUME HERE — next session

**Next sweep: Tone + death/emotion, together.** Tone is a known gap — 16 Tone
canonicals exist but the whole vocabulary is unswept because the §9 Tone folds
were prose-only: `absurd` 159 · `excited` 131 · `hilarious` 119 · `adoring` 113 ·
`ambiguous` 92 · `awestruck` 91 · `vibrant` 86 · `playful` 84 · `whimsical` 83 ·
`nostalgic` 80. Small keyword count, ~1,300 mentions — the best remaining
value-per-decision on the board.

Pair it with the **death/emotion cluster**: `loss of loved one` 176 ·
`dying and death` 93 · and the still-missing **`death`** (137) back-fill that was
deliberately deferred as too broad to fold as a side effect.

After that: **Setting · Period** (`holiday` 111, `future` 79, decade tail), then
the **~3,200-keyword long tail** — `surrealism` 120 · `psychopath` 116 ·
`escape` 102 · `torture` 99 · `flashback` 96 · `good versus evil` 88 · `dreams`
80. The tail is real content, not noise, and needs thematic bucketing rather
than one sweep.

**All deferred board rollups are now resolved** — nothing is left waiting on a
lost member list.

6. After pruning: revisit subsection count (likely merge some — the "reduce"
   pass), then decide floors (§9 rule 4).

Interaction pattern that's worked: sweep a category to ≥2 → surface all tags →
user names folds → apply as alias rules → dedup counts. Big categories get a
clustered inventory artifact rather than a flat dump.

### Master rule file — BUILT (`tag-rules/master.json`) + full review pass done

**`tag-rules/master.json` is now the single source of truth** — every fold from
all sources compiled into one file: `{ canonical, section, count, members[] }` ×
**377 canonicals / 2,103 aliases + 125 unassigned**, spanning 18 sections
(as of the love-people sweep, 2026-07-21). It is still a
decision record (not wired to an adapter yet — executable layer stays deferred),
but it is complete and machine-readable. The per-section files (crime.json,
genre-synonyms.json, subgenre-fantasy.json, society-politics.json,
love-relationships.json, people.json) are now **design history**; master.json
supersedes them for the alias→canonical mapping.

`master.json` also carries two fields added by the love-people sweep:
`sweeps[]` (a per-sweep audit trail) and `unassigned[]` (every deliberately
unfolded keyword with a `reason` — loose / held for a later section / blocked on
a missing parent). Canonicals created to fill a §9-prose gap carry
`"backfill": true`.

**Review pass (2026-07-20)** — consolidated everything, ran automated checks
(duplicate canonical names, double-folds, fold-of-a-folds), fixed all findings:
- Resolved double-folds: `political assassination`→assassin (not politics),
  `political satire`→satire (not politics), `mass shooting`→massacre (not
  terrorism). Flattened fold-of-folds: sniper→elite force, fighter pilot+jet
  fighter pilot→air force (dropped the standalone canonicals).
- Home moves: mummy→Creatures; android/cyborg→Creatures; witch/wizard→People·
  Roles; nuclear weapons→Military; colonialism/dictatorship→Politics; prostitute→
  Society; high school/college→Setting·Place; gold rush/holiday season/dynasty→
  Period; royalty→folded into monarchy.
- Dissolves: domestic abuse→abuse; anxiety+eating disorder→mental illness;
  virtual reality→alternate reality; santa's elves = christmas member only.
- Re-homed member aliases: vichy regime world-war→dictatorship; victorian england
  england→age of progress; occupied france france→world war; governance
  politician→government.
- **Stale §9 prose superseded by the board**: `italy ← ancient rome`, `japan ←
  feudal japan`, `greece ← ancient greece` etc. were later pulled into
  `historic empire` / `japanese epoch`; master.json reflects the corrected state.

Result: **0 duplicate names, 0 double-folds, 0 fold-of-folds.** Board matches
master.json. Rebuild/validate with the audit script (produces master.json + the
audit artifact). Dedup rule and the place city→state pattern are encoded in
master.json's `dedup_rule` / `expression_note`.

**The `tag-rules/` dir is now the durable sync place** — one JSON per section as
we finish it, each `{ canonical, count, home, members[] }` + a `still_loose` list
+ `overlaps_to_reconcile`. First file: **`tag-rules/crime.json`** (38 canonicals).
These are decision records, NOT yet wired to any adapter (executable layer still
deferred). Counts are real deduped unions computed from `film-kw.json`. As each
section finishes, add its file here; the eventual single tag-rules file is the
union of them.

Open design choice, decided **per-canonical** when we write the file: **direct
alias vs pattern.** A pattern (`/massacre/ → massacre`) is zero-upkeep and
auto-catches new import variants, but is unsafe where one corpus word belongs to
DIFFERENT roll-ups — e.g. `st. valentine's day massacre` is a Prohibition gang
event, not the `massacre` theme; `gang warfare`/`cartel warfare` ≠ military
`warfare`; `stasis` (sci-fi) ≠ `stasi`. Use **direct aliases** where the shared
word is ambiguous, **patterns** only where the tail is predictable and safe.
Every fold recorded here already carries an explicit member list, so nothing is
lost by deferring — the file just formalizes them.

---

## 10. Open questions for the promote contract

Settled this round (see §7–8): the pool IA, the three section shapes, Franchise
≥3, Reception subsections, the full Acclaimed/Era-defining rating methodology,
and the Essentials-list idea for the sub-2000-vote canon.

Still open:

1. Per-section floors — the exact cutoff per section (≥2 keeps more flavor; ≥3
   is safer). Directionally low; the specific number per section is unset.
2. `underseen` / `niche favourite` — re-derive on the shrunk score (they used a
   flat `va≥7.5`), same era-fairness reasoning as Acclaimed.
3. Keyword classification — actually authoring the ~200-keyword head into the
   Theme/Setting/Tone/Format subsections (the one real content-side task).
4. Shorts — 235 films under 45 min arrived via director-expand (largely Keaton
   silents). Is a 20-minute short a film recommendation?
5. Rarity heat — per-section percentile (see §5/§7); which Level tier surfaces
   it, and the visual treatment.
6. Section weights — Genre is 100; the priority order of the *other* sections
   when all shown at once, and whether any tags within a section vary by
   frequency vs hold equal weight. Only Genre=100 is fixed.
7. "Konomi Essentials" — build the curated list (~50–100 films) and decide where
   it surfaces (its own tag? a badge? part of Reception?).
8. Does "Film" mode include anime films? They exist in both AniList (`format:
   MOVIE`) and TMDB — dedupe rule needed, or a rule that Film = live-action.
9. Anime `eps` vs film `runtime` on the card — the most visible domain leak.
10. Buzzing refresh cadence + coherence model (topping vs full re-pull).

---

## Files

| Path | What |
|---|---|
| `scripts/import-anilist.ts` | AniList pull → `series`/`tags`/`series_tags` (top 500 by `POPULARITY_DESC`) |
| `scripts/import-tmdb.ts` | TMDB pull → `raw_tmdb_movies` (probe → seed → expand → hydrate → report) |
| `supabase/migrations/0009_*` | TMDB landing tables + exclusions log |
| `supabase/migrations/0010_*` | service_role grants (RLS ≠ grants — see 0002/0003) |
| `supabase/migrations/0011_*` | drops the payload GIN index |

Run: `npm run import:anilist` · `npm run import:tmdb`
