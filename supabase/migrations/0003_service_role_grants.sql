-- service_role bypasses RLS by role attribute, but — same as anon/
-- authenticated in 0002 — still needs base table-level grants before it can
-- touch these tables at all. This is what makes server-side imports/writes
-- (via SUPABASE_SECRET_KEY) actually work.

grant usage on schema public to service_role;

grant select, insert, update, delete on public.tags to service_role;
grant select, insert, update, delete on public.series to service_role;
grant select, insert, update, delete on public.series_tags to service_role;
