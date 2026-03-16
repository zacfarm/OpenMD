alter table public.marketplace_posts
  add column if not exists claimed_at timestamptz;
