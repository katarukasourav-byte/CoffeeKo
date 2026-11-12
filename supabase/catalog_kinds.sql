-- Catalogue: what each product is (beans, ground, instant, drip bags, cold brew, ready to drink,
-- South Indian filter blend) and how many servings a pack holds. Added Nov 2026 with brew styles.
-- Safe to run again. Undo: supabase/catalog_kinds_undo.sql

alter table public.catalog add column if not exists kind text
  check (kind in ('beans', 'ground', 'instant', 'dripbag', 'coldbrew', 'rtd', 'filterblend'));
alter table public.catalog add column if not exists pack_count int;   -- drip bags / sachets / bottles in one pack

-- Tag what is already there from the product name and the shop's own product type.
-- Same rules as ptype() in js/app.js; the daily sync and the AI keep it up to date afterwards.
update public.catalog c set kind = k.kind
from (
  select id, case
    when s ~ '\minstant\M' then 'instant'
    when s ~ 'cold ?brew' and s ~ '(bottle|\mcans?\M|ready to drink|\mrtd\M|\d+ ?ml)' then 'rtd'
    when s ~ 'cold ?brew' then 'coldbrew'
    when s ~ '(drip ?bag|pour ?over bag|dip ?bag|steep bag|easy pour)' then 'dripbag'
    when s ~ '(chicory|filter coffee|decoction)' then 'filterblend'
    when s ~ '(\mground\M|powder)' and s !~ 'whole ?bean' then 'ground'
    else 'beans' end as kind
  from (select id, lower(name || ' ' || coalesce(product_type, '')) s from public.catalog) t
) k
where c.id = k.id and c.kind is null;

create index if not exists catalog_kind_idx on public.catalog(kind);
