-- Adds AniList's Media.averageScore (top-level field, plain Int, 0-100 —
-- their own weighted-average viewer score).
--
-- Nullable, no default: AniList genuinely omits this for media with too few
-- scores yet (e.g. very new/unreleased), and 0 would misrepresent that as
-- "rated zero" rather than "not yet rated" — every consumer must handle the
-- null case explicitly, same as year/episodes already do.
--
-- Plain integer column, not normalized into its own table: this is a
-- single scalar with no per-value metadata (unlike tags' rank/category),
-- same reasoning that already applies to year/episodes.
--
-- No RLS/grant changes needed, same reasoning as 0004/0005.

alter table public.series add column average_score integer;
