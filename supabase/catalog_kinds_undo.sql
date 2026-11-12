-- UNDO for catalog_kinds.sql. Run only after the code that reads "kind" / "pack_count" is removed
-- (js/data.js catalogue columns), or the catalogue will fail to load.
-- Instant, drip bag and cold brew products stay in the table; to hide them as well:
--   update public.catalog set is_coffee = false where kind in ('instant','dripbag','coldbrew','rtd');
drop index if exists public.catalog_kind_idx;
alter table public.catalog drop column if exists kind;
alter table public.catalog drop column if exists pack_count;
