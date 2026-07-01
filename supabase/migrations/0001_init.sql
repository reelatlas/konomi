-- Konomi schema — anime series + tags, sourced from the AniList GraphQL API
--
-- Modeled on AniList's actual Media / MediaTag shape (not the old local mock
-- data), so import is a straight field-by-field mapping:
--
--   Media                  -> series
--     id                      anilist_id
--     title.romaji            title_romaji
--     title.english           title_english
--     title.native            title_native
--     startDate.year           year
--     episodes                  episodes
--     coverImage.large           cover_image_url
--
--   MediaTag                -> tags
--     id                      anilist_id
--     name                     name
--
--   MediaTag.rank (per Media) -> series_tags.rank
--
-- MediaTag.rank, isGeneralSpoiler, isMediaSpoiler, and isAdult are all
-- properties of a *tag-on-this-media* pairing, not of the tag itself (the
-- same tag can rank differently, or be a spoiler, on different shows) — so
-- rank belongs on the join table, per the decision below, not on `tags`.
--
-- isGeneralSpoiler / isMediaSpoiler / isAdult are used only as an IMPORT-TIME
-- filter (see decisions below) and are not persisted: every row that makes
-- it into series_tags already satisfies all three = false, so the columns
-- would be constant and redundant. If you later want to loosen the filter
-- without re-fetching from AniList, say so and I'll add them back.
--
-- Tags stay normalized into their own table + many-to-many join (not a
-- `text[]` column on series) because the app's core mechanic — score a
-- series by tag overlap, filter by a MIN TAG MATCH floor — is naturally a
-- join + count query against this shape:
--
--   select s.*, count(*) as match_count
--   from series s
--   join series_tags st on st.series_id = s.id
--   join tags t on t.id = st.tag_id
--   where t.name = any($1)          -- selected tags
--   group by s.id
--   having count(*) >= $2           -- min match
--
-- Import-pipeline decisions (enforced by the import script, not by SQL):
--   - Only the top 10 tags per series by rank are imported.
--   - Any tag with isGeneralSpoiler, isMediaSpoiler, or isAdult = true is
--     excluded entirely for that series.
--
-- updated_at: every table gets created_at + an auto-maintained updated_at,
-- via one shared trigger function (set_updated_at, defined once below and
-- attached per table) rather than duplicated logic. This covers staleness
-- detection for all three tables against future re-syncs from AniList —
-- including series_tags.rank, which is exactly the kind of value likely to
-- drift between syncs as AniList's own relevance scoring updates.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  anilist_id integer not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tags_set_updated_at
  before update on public.tags
  for each row
  execute function public.set_updated_at();

create table public.series (
  id uuid primary key default gen_random_uuid(),
  anilist_id integer not null unique,
  title_romaji text not null,
  title_english text,
  title_native text,
  year integer,
  episodes integer,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- year, episodes, and the title/cover fields are nullable because AniList
-- allows null for all of them (e.g. "Not Yet Released" media has no
-- year/episode count; english/native titles are frequently null for niche
-- entries). No unique constraint on any title column — anilist_id is the
-- only guaranteed-unique identity; titles can collide (remakes, generic
-- sequels).

create trigger series_set_updated_at
  before update on public.series
  for each row
  execute function public.set_updated_at();

create table public.series_tags (
  series_id uuid not null references public.series (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  rank integer not null check (rank >= 0 and rank <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (series_id, tag_id)
);

create trigger series_tags_set_updated_at
  before update on public.series_tags
  for each row
  execute function public.set_updated_at();

-- Speeds up "find all series for these tags" (the scoring query above runs
-- this direction); the primary key already covers the reverse lookup.
create index series_tags_tag_id_idx on public.series_tags (tag_id);

-- Row Level Security: this is public catalog data (no user-specific rows),
-- readable by anyone via the anon key, but only writable through the
-- service-role key (SUPABASE_SECRET_KEY, server-side only — service_role
-- bypasses RLS entirely, so no explicit write policy is needed or added).
alter table public.tags enable row level security;
alter table public.series enable row level security;
alter table public.series_tags enable row level security;

create policy "tags are publicly readable"
  on public.tags for select
  to anon, authenticated
  using (true);

create policy "series are publicly readable"
  on public.series for select
  to anon, authenticated
  using (true);

create policy "series_tags are publicly readable"
  on public.series_tags for select
  to anon, authenticated
  using (true);
