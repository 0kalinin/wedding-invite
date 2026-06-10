-- Gender of the primary guest, used to pick wording like "один"/"одна"
-- (e.g. the "приду один(а)" RSVP button). 'm' | 'f' | null (unknown -> neutral).
alter table public.guests add column gender text;

-- Backfill for the initial seeded guests.
update public.guests set gender = 'm' where name in ('Миша', 'Лёша', 'Сергей');
update public.guests set gender = 'f' where name in ('Лена', 'Настя', 'Полина');
