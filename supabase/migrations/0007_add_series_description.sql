-- Adds AniList's Media.description (top-level field, plain String — their
-- own prose summary of the story/characters).
--
-- Nullable, no default: AniList genuinely omits this for some entries, same
-- "genuinely absent, not faked" reasoning that already applies to
-- year/episodes/average_score.
--
-- Stored pre-cleaned by the import script (literal <br> tags converted to
-- real newlines, trailing "(Source: ...)" citations and AniList's own
-- ~!spoiler!~ markup stripped) — see cleanDescription() in
-- scripts/import-anilist.ts. Plain text, not HTML: the app renders this with
-- CSS white-space handling, never dangerouslySetInnerHTML, so storing HTML
-- here would just be dead markup, not a rendering aid.
--
-- No RLS/grant changes needed, same reasoning as 0004/0005/0006.

alter table public.series add column description text;
