create table public.marketplace_posts (
  id uuid primary key default gen_random_uuid(),
  post_type text not null check (post_type in ('facility_request', 'provider_offer')),
  tenant_id uuid references public.tenants(id) on delete set null,
  provider_id uuid references public.provider_profiles(id) on delete set null,
  title text not null,
  specialty text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  details text,
  status text not null default 'open' check (status in ('open', 'claimed', 'closed')),
  created_by uuid not null references auth.users(id) on delete cascade,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index idx_marketplace_status_created_at on public.marketplace_posts (status, created_at desc);
create index idx_marketplace_type_status on public.marketplace_posts (post_type, status);

create trigger trg_marketplace_posts_updated_at
before update on public.marketplace_posts
for each row execute function public.set_updated_at();

alter table public.marketplace_posts enable row level security;

create policy "marketplace_select_authenticated" on public.marketplace_posts
  for select to authenticated using (true);

create policy "marketplace_insert_authenticated" on public.marketplace_posts
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "marketplace_update_creator" on public.marketplace_posts
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create or replace function public.claim_marketplace_post(post_id uuid)
returns public.marketplace_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.marketplace_posts;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  update public.marketplace_posts mp
  set
    status = 'claimed',
    claimed_by_user_id = auth.uid(),
    claimed_at = now()
  where mp.id = post_id
    and mp.status = 'open'
  returning mp.* into updated_row;

  if updated_row.id is null then
    raise exception 'Post is no longer open';
  end if;

  return updated_row;
end;
$$;

grant execute on function public.claim_marketplace_post(uuid) to authenticated;
