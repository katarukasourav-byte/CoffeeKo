-- =====================================================================
-- COFFEEKO — coffee catalogue (added Nov 2026).
-- Real coffees from roasters' own shops, refreshed automatically by the
-- Netlify function netlify/functions/catalog-cron.mjs. Everyone can read it;
-- only the server function can write to it.
-- Safe to run again.
-- =====================================================================

create table if not exists public.catalog (
  id            text primary key,          -- e.g. "bluetokaicoffee.com/attikan-estate"
  roaster       text not null,
  name          text not null,
  url           text not null,             -- direct product page
  image         text,                      -- packaging photo
  images        jsonb default '[]',
  price_inr     int,                       -- price of the smallest whole-bean pack
  pack_g        int,
  price_250     int,                       -- price scaled to 250 g, for comparing
  available     boolean default true,
  origin        text,                      -- country, e.g. "India"
  region        text,                      -- e.g. "Chikmagalur, Karnataka"
  estate        text,
  altitude      text,
  variety       text,
  process       text,
  roast_level   text,                      -- light | medium-light | medium | medium-dark | dark
  notes         jsonb default '[]',
  acidity       int, body int, sweetness int, bitterness int,
  grade         text,
  blend         boolean,
  summary       text,
  source        text default 'shop',       -- shop | web
  content_hash  text,                      -- detects changed product text
  extracted     boolean default false,     -- AI has read the description
  is_coffee     boolean default true,
  first_seen    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists catalog_roaster_idx on public.catalog(roaster);

create table if not exists public.catalog_roasters (
  domain       text primary key,
  roaster      text,
  last_synced  timestamptz,
  status       text,
  products     int
);

alter table public.catalog enable row level security;
alter table public.catalog_roasters enable row level security;
drop policy if exists "anyone can read catalog" on public.catalog;
create policy "anyone can read catalog" on public.catalog for select using (true);
-- no insert/update/delete policies: only the server function (service role) writes
