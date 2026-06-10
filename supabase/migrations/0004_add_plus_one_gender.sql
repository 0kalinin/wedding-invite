-- Gender of the +1 (set by admin), used for wording like "спутник"/"спутница"
-- when the +1's name isn't known. 'm' | 'f' | null.
alter table public.guests add column plus_one_gender text;

-- Backfill for the initially seeded named +1s.
update public.guests set plus_one_gender = 'm' where plus_one_name = 'Олег';
update public.guests set plus_one_gender = 'f' where plus_one_name in ('Маша', 'Юля');
