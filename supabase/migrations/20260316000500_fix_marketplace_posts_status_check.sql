alter table public.marketplace_posts
  drop constraint if exists marketplace_posts_status_check;

alter table public.marketplace_posts
  add constraint marketplace_posts_status_check
  check (status in ('open', 'claimed', 'closed'));
