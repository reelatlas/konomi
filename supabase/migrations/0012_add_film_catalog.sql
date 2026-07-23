-- Film-side shared catalog partition — the promote target for
-- scripts/promote-tmdb.ts (reads raw_tmdb_movies + tag-rules/master.json +
-- tag-rules/adapter-config.json). Design decided 2026-07-24 (adapter parts
-- 1-6, see DATA_SOURCING "STEP 5 ADAPTER DESIGN — COMPLETE").
--
-- ISOLATION BY CONSTRUCTION: this partition is fully separate from the anime
-- tables (series/tags/series_tags). Film tags' members are film ids — a film
-- tag cannot return an anime and vice versa. Same infrastructure PATTERNS as
-- the anime side (RLS public-read, service-role writes, set_updated_at
-- triggers, join+count scoring shape), never mixed data.
--
-- Column-vs-join rule mirrors the anime side's own precedents:
--   closed vocabulary, no per-pair metadata -> column on films
--     (genres text[] mirrors series.genres 0005; reception the same shape;
--      certification/decade/original_language plain columns)
--   open growing vocabulary -> film_tags + film_tag_links join
--     (kw canonicals, sagas, people, studios — mirrors tags/series_tags 0001)
--   per-value metadata but small closed set -> jsonb on films
--     (watch_providers mirrors series.streaming_services 0008; JustWatch
--      attribution REQUIRED wherever displayed — TMDB terms)
--
-- The scoring query is the same join+count shape as the anime side:
--   select f.*, count(*) as match_count
--   from films f
--   join film_tag_links l on l.film_id = f.id
--   join film_tags t on t.id = l.tag_id
--   where t.key = any($1)
--   group by f.id
--   having count(*) >= $2
-- Closed-vocab selections (genres, reception, certification, decade,
-- original_language) filter on their columns directly, like series.genres.

create table public.films (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null unique,
  title text not null,
  original_title text,
  year integer,
  decade text,                 -- display band of year ("1970s"; "pre-1920s" grouped)
  runtime integer,             -- minutes; band-tags are a reserved later config knob
  rating numeric(4,2),         -- raw TMDB vote_average (MVP ruling; transform post-MVP)
  vote_count integer,
  genres text[] not null default '{}',        -- TMDB genre names, wt-100 layer
  reception text[] not null default '{}',     -- the 14 reception tags this film carries
  certification text,          -- US certification (G/PG/PG-13/R/NC-17/NR...), from release_dates
  original_language text,
  countries text[] not null default '{}',     -- production country names
  saga_name text,              -- display name (stripped " Collection"); set for ALL collection films
  saga_shelf boolean not null default false,  -- true when the saga also exists as a selectable tag (>=2 corpus films)
  overview text,
  tagline text,
  poster_path text,
  backdrop_path text,
  budget bigint,
  revenue bigint,
  watch_providers jsonb not null default '[]'::jsonb, -- US flatrate only: [{name, logo_path}] + link; snapshot-frozen
  watch_link text,             -- the JustWatch-powered TMDB link for the film's providers page
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger films_set_updated_at
  before update on public.films
  for each row
  execute function public.set_updated_at();

-- Open-vocabulary selectable tags: kw canonicals, sagas, people, studios.
-- `key` is the stable identity across promotes (uuid ids are rebuilt).
create table public.film_tags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,    -- "kw:heist" | "saga:645" | "person:director:1032" | "studio:2"
  type text not null check (type in ('kw', 'saga', 'actor', 'director', 'producer', 'cinematographer', 'composer', 'studio')),
  name text not null,          -- display label (sentence-case standard lives upstream in master.json)
  pillar text,                 -- kw only: Feel | Setting | Story | Style
  section text,                -- kw only: the 34-section tree
  film_count integer not null default 0,
  min_level text not null default 'film buff' check (min_level in ('moviegoer', 'film buff', 'cinephile')),
  extra jsonb,                 -- saga tmdb collection id, person tmdb id, etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- min_level encodes the banked level gating (adapter-config.json):
--   kw: 'film buff' when film_count >= floor (55), else 'cinephile'
--   saga: 'moviegoer' (all levels — user ruling)
--   people/studio: 'film buff' (buff + cinephile — user ruling)
-- Singleton sagas (1 corpus film) get NO film_tags row at all — they are
-- card-only read-only display via films.saga_name (user ruling).

create trigger film_tags_set_updated_at
  before update on public.film_tags
  for each row
  execute function public.set_updated_at();

create table public.film_tag_links (
  film_id uuid not null references public.films (id) on delete cascade,
  tag_id uuid not null references public.film_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (film_id, tag_id)
);

-- Same direction the anime scoring index covers (0001).
create index film_tag_links_tag_id_idx on public.film_tag_links (tag_id);

-- RLS: public catalog data, readable by anyone, writable only via the
-- service-role key (bypasses RLS) — the 0001 pattern verbatim.
alter table public.films enable row level security;
alter table public.film_tags enable row level security;
alter table public.film_tag_links enable row level security;

create policy "films are publicly readable"
  on public.films for select
  to anon, authenticated
  using (true);

create policy "film_tags are publicly readable"
  on public.film_tags for select
  to anon, authenticated
  using (true);

create policy "film_tag_links are publicly readable"
  on public.film_tag_links for select
  to anon, authenticated
  using (true);

-- Base table-level grants — RLS sits on top of these; fresh tables created
-- via migration don't get them automatically (the 0002/0003 lesson).
grant select on public.films to anon, authenticated;
grant select on public.film_tags to anon, authenticated;
grant select on public.film_tag_links to anon, authenticated;

grant select, insert, update, delete on public.films to service_role;
grant select, insert, update, delete on public.film_tags to service_role;
grant select, insert, update, delete on public.film_tag_links to service_role;
