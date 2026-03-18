alter table public.directory_entities
  add column if not exists parent_entity_id uuid references public.directory_entities(id) on delete set null;

alter table public.directory_entities
  add constraint directory_entities_provider_id_key unique (provider_id);

create index if not exists idx_directory_entities_parent on public.directory_entities (parent_entity_id);

alter table public.directory_reviews
  drop constraint if exists directory_reviews_tags_check;

create table if not exists public.global_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.review_tag_options (
  id uuid primary key default gen_random_uuid(),
  entity_type public.directory_entity_type not null,
  slug text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, slug)
);

create table if not exists public.directory_review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.directory_reviews(id) on delete cascade,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  details text,
  source_path text,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_directory_review_reports_status on public.directory_review_reports (status, created_at desc);
create index if not exists idx_directory_review_reports_review on public.directory_review_reports (review_id);

create trigger trg_review_tag_options_updated_at
before update on public.review_tag_options
for each row execute function public.set_updated_at();

create trigger trg_directory_review_reports_updated_at
before update on public.directory_review_reports
for each row execute function public.set_updated_at();

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.global_admins ga
    where ga.user_id = auth.uid()
  );
$$;

create or replace function public.validate_directory_entity_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_type public.directory_entity_type;
  parent_tenant_id uuid;
begin
  if new.parent_entity_id is null then
    return new;
  end if;

  select de.entity_type, de.tenant_id
  into parent_type, parent_tenant_id
  from public.directory_entities de
  where de.id = new.parent_entity_id;

  if parent_type is null then
    raise exception 'Parent directory entity does not exist';
  end if;

  if new.entity_type <> 'doctor' then
    raise exception 'Only doctor entities can have a parent entity';
  end if;

  if parent_type not in ('practice', 'facility') then
    raise exception 'Parent entity must be a practice or facility';
  end if;

  if parent_tenant_id is distinct from new.tenant_id then
    raise exception 'Parent and child directory entities must belong to the same tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_directory_entity_parent on public.directory_entities;

create trigger trg_validate_directory_entity_parent
before insert or update on public.directory_entities
for each row execute function public.validate_directory_entity_parent();

create or replace function public.sync_provider_directory_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tenant_kind public.org_type;
  parent_org_entity_id uuid;
  existing_slug text;
begin
  if new.practice_tenant_id is null then
    delete from public.directory_entities where provider_id = new.id;
    return new;
  end if;

  select t.org_type into tenant_kind
  from public.tenants t
  where t.id = new.practice_tenant_id;

  if tenant_kind is null then
    return new;
  end if;

  if tenant_kind = 'independent_doctor' then
    delete from public.directory_entities where provider_id = new.id;
    return new;
  end if;

  select de.id
  into parent_org_entity_id
  from public.directory_entities de
  where de.tenant_id = new.practice_tenant_id
    and de.parent_entity_id is null
    and de.entity_type in ('practice', 'facility')
  order by de.created_at asc
  limit 1;

  if parent_org_entity_id is null then
    return new;
  end if;

  select de.slug
  into existing_slug
  from public.directory_entities de
  where de.provider_id = new.id;

  insert into public.directory_entities (
    entity_type,
    tenant_id,
    provider_id,
    parent_entity_id,
    slug,
    name,
    specialty,
    location,
    description,
    is_active
  ) values (
    'doctor',
    new.practice_tenant_id,
    new.id,
    parent_org_entity_id,
    coalesce(existing_slug, public.slugify(new.display_name) || '-' || substr(new.id::text, 1, 8)),
    new.display_name,
    new.specialty,
    concat_ws(', ', nullif(new.home_city, ''), nullif(new.home_state, '')),
    null,
    new.is_public
  )
  on conflict (provider_id) do update
  set
    tenant_id = excluded.tenant_id,
    parent_entity_id = excluded.parent_entity_id,
    name = excluded.name,
    specialty = excluded.specialty,
    location = excluded.location,
    is_active = excluded.is_active;

  return new;
end;
$$;

drop trigger if exists trg_sync_provider_directory_entity on public.provider_profiles;

create trigger trg_sync_provider_directory_entity
after insert or update on public.provider_profiles
for each row execute function public.sync_provider_directory_entity();

update public.directory_entities de
set
  entity_type = 'practice',
  provider_id = null,
  name = t.name,
  description = 'Independent practice profile on OpenMD',
  parent_entity_id = null
from public.tenants t
where de.tenant_id = t.id
  and t.org_type = 'independent_doctor'
  and de.entity_type = 'doctor';

update public.directory_entities child
set parent_entity_id = parent.id
from public.directory_entities parent
where child.provider_id is not null
  and child.parent_entity_id is null
  and child.tenant_id = parent.tenant_id
  and child.id <> parent.id
  and parent.parent_entity_id is null
  and parent.entity_type in ('practice', 'facility');

insert into public.directory_entities (
  entity_type,
  tenant_id,
  provider_id,
  parent_entity_id,
  slug,
  name,
  specialty,
  location,
  description,
  is_active
)
select
  'doctor',
  pp.practice_tenant_id,
  pp.id,
  parent.id,
  public.slugify(pp.display_name) || '-' || substr(pp.id::text, 1, 8),
  pp.display_name,
  pp.specialty,
  concat_ws(', ', nullif(pp.home_city, ''), nullif(pp.home_state, '')),
  null,
  pp.is_public
from public.provider_profiles pp
join public.tenants t on t.id = pp.practice_tenant_id and t.org_type in ('practice', 'facility')
join public.directory_entities parent
  on parent.tenant_id = pp.practice_tenant_id
 and parent.parent_entity_id is null
 and parent.entity_type in ('practice', 'facility')
left join public.directory_entities existing on existing.provider_id = pp.id
where existing.id is null
on conflict (provider_id) do update
set
  tenant_id = excluded.tenant_id,
  parent_entity_id = excluded.parent_entity_id,
  name = excluded.name,
  specialty = excluded.specialty,
  location = excluded.location,
  is_active = excluded.is_active;

insert into public.review_tag_options (entity_type, slug, label, sort_order)
values
  ('doctor', 'bedside_manner', 'Bedside manner', 10),
  ('doctor', 'communication', 'Communication', 20),
  ('doctor', 'clinical_judgment', 'Clinical judgment', 30),
  ('doctor', 'wait_time', 'Wait time', 40),
  ('practice', 'scheduling', 'Scheduling', 10),
  ('practice', 'front_desk', 'Front desk', 20),
  ('practice', 'billing', 'Billing clarity', 30),
  ('practice', 'staff_professionalism', 'Staff professionalism', 40),
  ('facility', 'staff_professionalism', 'Staff professionalism', 10),
  ('facility', 'cleanliness', 'Cleanliness', 20),
  ('facility', 'scheduling', 'Scheduling', 30),
  ('facility', 'billing', 'Billing clarity', 40)
on conflict (entity_type, slug) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_active = true;

alter table public.global_admins enable row level security;
alter table public.review_tag_options enable row level security;
alter table public.directory_review_reports enable row level security;

create policy "global_admins_select_self_or_admin" on public.global_admins
  for select using (user_id = auth.uid() or public.is_global_admin());

create policy "global_admins_insert_bootstrap_or_admin" on public.global_admins
  for insert with check (
    (
      auth.uid() = user_id
      and not exists (select 1 from public.global_admins)
    )
    or public.is_global_admin()
  );

create policy "global_admins_manage_admin" on public.global_admins
  for all using (public.is_global_admin())
  with check (public.is_global_admin());

create policy "review_tag_options_select_active" on public.review_tag_options
  for select using (is_active or public.is_global_admin());

create policy "review_tag_options_manage_admin" on public.review_tag_options
  for all using (public.is_global_admin())
  with check (public.is_global_admin());

create policy "directory_review_reports_insert_all" on public.directory_review_reports
  for insert with check (reporter_user_id is null or reporter_user_id = auth.uid());

create policy "directory_review_reports_select_admin" on public.directory_review_reports
  for select using (public.is_global_admin());

create policy "directory_review_reports_update_admin" on public.directory_review_reports
  for update using (public.is_global_admin())
  with check (public.is_global_admin());

grant select on public.review_tag_options to anon, authenticated;
grant insert on public.directory_review_reports to anon, authenticated;
grant select, insert, update, delete on public.global_admins to authenticated;
grant select, insert, update, delete on public.review_tag_options to authenticated;
grant select, update on public.directory_review_reports to authenticated;
