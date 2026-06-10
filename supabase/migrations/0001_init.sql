-- Schema for the wedding invitation app.
-- Applied to the Supabase project via MCP (apply_migration); kept here for record.

create extension if not exists pgcrypto;

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                 -- random code used in the personal link
  name text not null,                        -- primary guest display name
  has_plus_one boolean not null default false,
  plus_one_name text,                        -- known +1 name (null if unknown / none)
  attendance text,                           -- null=unanswered; solo: yes/no; +1: both/one/none
  plus_one_name_filled text,                 -- +1 name entered by the guest
  survey jsonb not null default '{}'::jsonb, -- questionnaire answers (free-form)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_config (
  key text primary key,
  value text not null
);

-- The frontend never touches these tables directly; only Edge Functions
-- (service role, which bypasses RLS) do. RLS is enabled with no policies,
-- so anon/public access is fully closed.
alter table public.guests enable row level security;
alter table public.app_config enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger guests_set_updated_at
before update on public.guests
for each row execute function public.set_updated_at();

-- Seeded separately (codes/token generated at runtime):
--   guests: Миша, Лена(+Олег), Лёша(+1), Настя(+Маша), Полина(+1), Сергей(+Юля)
--   app_config: admin_token = encode(gen_random_bytes(24),'hex')
