-- Base table-level grants for the TMDB landing tables added in 0009.
--
-- Same trap 0002 and 0003 already documented for series/tags/series_tags:
-- enabling RLS and writing (or deliberately omitting) policies is only half
-- the story — Postgres requires a base GRANT before a role can touch a table
-- at all, and tables created by migration rather than through the Supabase
-- dashboard don't get one automatically. 0009 enabled RLS on both tables and
-- correctly reasoned that service_role bypasses RLS by role attribute so
-- needs no policy, but that reasoning is about POLICIES; the grant is a
-- separate mechanism underneath and still has to be issued. The import script
-- failed with "permission denied for table raw_tmdb_movies" on its first run
-- as a result.
--
-- service_role only, deliberately: unlike 0002, there is no matching grant to
-- anon/authenticated here. These tables are internal pipeline state (raw
-- third-party payloads and rejection logs), not public catalog data — nothing
-- client-side should read them, so the absence of an anon grant is a second
-- layer of defence behind 0009's deny-by-omission RLS.

grant select, insert, update, delete on public.raw_tmdb_movies to service_role;
grant select, insert, update, delete on public.tmdb_ingest_exclusions to service_role;
