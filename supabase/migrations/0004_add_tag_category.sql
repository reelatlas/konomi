-- Adds AniList's MediaTag.category (e.g. "Theme-Action", "Cast-Traits",
-- "Demographic" — see the 24 values confirmed directly from AniList's
-- MediaTagCollection) so the tag pool can eventually be organized/filtered
-- by category instead of one flat alphabetical list.
--
-- Nullable: none of the 276 tags currently imported have this populated yet.
-- Backfilled by re-running scripts/import-anilist.ts once it requests
-- `category` in the AniList query (upsert-by-anilist_id updates the
-- existing rows in place, same as any other rerun).
--
-- No RLS/grant changes needed — this adds a column to an existing table,
-- and both RLS policies and GRANTs from 0001-0003 already apply table-wide.

alter table public.tags add column category text;
