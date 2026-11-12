-- UNDO for brew_wall.sql: removes the Brew Wall from the database.
-- Run only if you are removing the Brew Wall feature. It deletes every shared post and like.
-- Remove the Brew Wall code first (see CHANGELOG.md), or the page will show
-- "The Brew Wall couldn't load".

drop table if exists public.brew_likes;
drop table if exists public.brew_posts;
drop function if exists public.brew_pending_count();

-- app_admins and is_admin() are kept on purpose: other admin features may use them later.
-- To remove them too, uncomment:
-- drop function if exists public.is_admin();
-- drop table if exists public.app_admins;
