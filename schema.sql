-- =====================================================================
-- PALATE & POUR — database setup.
-- Supabase dashboard → SQL Editor → New query → paste all of this → Run.
-- Safe to run again: it only creates what is missing.
-- =====================================================================

-- One row per user: quiz answers, settings, latest Explore suggestions
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  prefs      jsonb,
  settings   jsonb,
  explore    jsonb,
  updated_at timestamptz default now()
);

-- Coffees each user has rated or saved
create table if not exists public.journal (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  data       jsonb not null,
  created_at timestamptz default now()
);
create index if not exists journal_user_idx on public.journal(user_id);

-- Bags on each user's shelf
create table if not exists public.shelf (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  data       jsonb not null,
  created_at timestamptz default now()
);
create index if not exists shelf_user_idx on public.shelf(user_id);

-- Daily AI usage counter (only the server function can touch this)
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  kind    text not null,
  count   int  not null default 0,
  primary key (user_id, day, kind)
);

-- ---------- Privacy rules: each user sees only their own rows ----------
alter table public.profiles enable row level security;
alter table public.journal  enable row level security;
alter table public.shelf    enable row level security;
alter table public.ai_usage enable row level security;   -- no policies = no browser access

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own journal" on public.journal;
create policy "own journal" on public.journal for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own shelf" on public.shelf;
create policy "own shelf" on public.shelf for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Daily limit: count one use, say yes/no ----------
create or replace function public.use_ai_quota(p_user uuid, p_kind text, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  insert into ai_usage (user_id, day, kind, count)
  values (p_user, (now() at time zone 'utc')::date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = ai_usage.count + 1
  returning count into n;
  return n <= p_limit;
end;
$$;
revoke all on function public.use_ai_quota(uuid, text, int) from public, anon, authenticated;
grant execute on function public.use_ai_quota(uuid, text, int) to service_role;

-- Handy view for you: AI use per day (read it in the Table Editor)
create or replace view public.ai_usage_by_day with (security_invoker = true) as
  select day, kind, count(distinct user_id) as users, sum(count) as requests
  from public.ai_usage group by day, kind order by day desc, kind;
