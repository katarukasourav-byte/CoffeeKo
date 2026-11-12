-- Brew Wall: home brewers share their Instagram posts (link + handle), shown on CoffeeKo
-- through Instagram's official embed. Nothing appears until an admin approves it.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
drop policy if exists "see own admin row" on public.app_admins;
create policy "see own admin row" on public.app_admins for select using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.app_admins where user_id = auth.uid()) $$;

create table if not exists public.brew_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ig_code text not null unique check (ig_code ~ '^[A-Za-z0-9_-]{5,40}$'),
  ig_kind text not null default 'p' check (ig_kind in ('p', 'reel', 'tv')),
  handle text not null check (handle ~ '^[A-Za-z0-9._]{1,30}$'),
  caption text check (char_length(caption) <= 160),
  coffee text check (char_length(coffee) <= 120),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists brew_posts_status_idx on public.brew_posts (status, created_at desc);
alter table public.brew_posts enable row level security;

-- at most 5 posts waiting for review per person
create or replace function public.brew_pending_count() returns int
language sql stable security definer set search_path = public as
$$ select count(*)::int from public.brew_posts where user_id = auth.uid() and status = 'pending' $$;

drop policy if exists "read approved or own" on public.brew_posts;
create policy "read approved or own" on public.brew_posts for select
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());
drop policy if exists "add own, pending" on public.brew_posts;
create policy "add own, pending" on public.brew_posts for insert
  with check (user_id = auth.uid() and status = 'pending' and public.brew_pending_count() < 5);
drop policy if exists "admin reviews" on public.brew_posts;
create policy "admin reviews" on public.brew_posts for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "delete own or admin" on public.brew_posts;
create policy "delete own or admin" on public.brew_posts for delete using (user_id = auth.uid() or public.is_admin());

create table if not exists public.brew_likes (
  post_id uuid not null references public.brew_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.brew_likes enable row level security;
drop policy if exists "likes are public" on public.brew_likes;
create policy "likes are public" on public.brew_likes for select using (true);
drop policy if exists "like approved posts" on public.brew_likes;
create policy "like approved posts" on public.brew_likes for insert
  with check (user_id = auth.uid() and exists (select 1 from public.brew_posts p where p.id = post_id and p.status = 'approved'));
drop policy if exists "unlike own" on public.brew_likes;
create policy "unlike own" on public.brew_likes for delete using (user_id = auth.uid());

grant select, insert, delete on public.brew_posts to authenticated;
grant update (status, reviewed_at) on public.brew_posts to authenticated;
grant select on public.brew_posts to anon;
grant select, insert, delete on public.brew_likes to authenticated;
grant select on public.brew_likes to anon;
