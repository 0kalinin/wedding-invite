-- Admin-only private label to tell same-named guests apart (e.g. surname).
-- Never exposed by the guest API (its GUEST_FIELDS list excludes it);
-- only returned/edited via the admin API.
alter table public.guests add column full_name text;
