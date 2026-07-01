-- RLS policies (0001) control row-level access, but Postgres also requires
-- a base table-level GRANT before a role can query a table at all — RLS
-- only takes effect on top of that. Fresh tables created outside the
-- Supabase dashboard's table editor don't get this automatically, so the
-- public-read intent from 0001 needs these explicit grants to actually work.

grant usage on schema public to anon, authenticated;

grant select on public.tags to anon, authenticated;
grant select on public.series to anon, authenticated;
grant select on public.series_tags to anon, authenticated;
