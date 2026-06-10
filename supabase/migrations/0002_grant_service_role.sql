-- Edge Functions connect as `service_role` (which bypasses RLS) but still need
-- table-level privileges. When the schema was created via the Management API,
-- Supabase's default grants for service_role were not applied, causing
-- "permission denied for table guests". Grant only to service_role; anon and
-- authenticated get no grants, so the tables stay fully closed to the public.
grant select, insert, update, delete on public.guests to service_role;
grant select, insert, update, delete on public.app_config to service_role;
