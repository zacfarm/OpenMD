create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.org_type as enum ('practice', 'facility', 'independent_doctor');
create type public.tenant_role as enum ('admin', 'scheduler', 'billing', 'provider');
create type public.directory_entity_type as enum ('doctor', 'facility', 'practice');
create type public.booking_status as enum ('requested', 'accepted', 'declined', 'confirmed', 'canceled');
create type public.notification_status as enum ('unread', 'read');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext unique not null,
  full_name text not null default 'OpenMD User',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type public.org_type not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tenant_role not null,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email citext not null,
  role public.tenant_role not null,
  invite_token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create table public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  specialty text,
  home_city text,
  home_state text,
  practice_tenant_id uuid references public.tenants(id) on delete set null,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_facility_links (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  facility_tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (provider_id, facility_tenant_id)
);

create table public.provider_availability (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  location text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table public.provider_time_off (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  requesting_tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  requested_start timestamptz not null,
  requested_end timestamptz not null,
  location text,
  notes text,
  status public.booking_status not null default 'requested',
  requested_by uuid not null references auth.users(id) on delete cascade,
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requested_end > requested_start)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  action_url text,
  metadata jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'unread',
  created_at timestamptz not null default now()
);

create table public.directory_entities (
  id uuid primary key default gen_random_uuid(),
  entity_type public.directory_entity_type not null,
  tenant_id uuid references public.tenants(id) on delete set null,
  provider_id uuid references public.provider_profiles(id) on delete set null,
  slug text not null unique,
  name text not null,
  specialty text,
  location text,
  description text,
  average_rating numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.directory_reviews (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.directory_entities(id) on delete cascade,
  star_rating smallint not null check (star_rating between 1 and 5),
  tags text[] not null default '{}',
  comment text,
  created_at timestamptz not null default now(),
  check (comment is null or (char_length(comment) between 20 and 800)),
  check (tags <@ array['communication','wait_time','staff_professionalism','billing_clarity','facility_cleanliness'])
);

create index idx_tenant_memberships_user on public.tenant_memberships (user_id);
create index idx_provider_user on public.provider_profiles (user_id);
create index idx_booking_provider on public.booking_requests (provider_id, requested_start);
create index idx_booking_tenant on public.booking_requests (requesting_tenant_id, requested_start);
create index idx_notifications_user_status on public.notifications (user_id, status, created_at desc);
create index idx_directory_search_name on public.directory_entities using gin (to_tsvector('simple', coalesce(name, '')));
create index idx_directory_search_specialty on public.directory_entities (specialty);
create index idx_directory_search_location on public.directory_entities (location);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_tenants_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

create trigger trg_provider_profiles_updated_at
before update on public.provider_profiles
for each row execute function public.set_updated_at();

create trigger trg_directory_entities_updated_at
before update on public.directory_entities
for each row execute function public.set_updated_at();

create trigger trg_booking_requests_updated_at
before update on public.booking_requests
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, concat(new.id::text, '@placeholder.local')),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'OpenMD User'), '@', 1))
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_tenant_member(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = target_tenant
      and tm.user_id = auth.uid()
  );
$$;

create or replace function public.current_tenant_role(target_tenant uuid)
returns public.tenant_role
language sql
stable
security definer
set search_path = public
as $$
  select tm.role
  from public.tenant_memberships tm
  where tm.tenant_id = target_tenant
    and tm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_manage_provider(target_provider uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.provider_profiles pp
    left join public.tenant_memberships tm on tm.tenant_id = pp.practice_tenant_id and tm.user_id = auth.uid()
    where pp.id = target_provider
      and (
        pp.user_id = auth.uid()
        or tm.user_id is not null
      )
  );
$$;

create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(trim(value)), '[^a-z0-9]+', '-', 'g');
$$;

create or replace function public.bootstrap_tenant(
  org_name text,
  org_kind public.org_type,
  full_name_input text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
  doctor_profile_id uuid;
  base_slug text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  update public.profiles
  set full_name = coalesce(nullif(trim(full_name_input), ''), full_name)
  where id = auth.uid();

  insert into public.tenants (name, org_type, owner_user_id)
  values (trim(org_name), org_kind, auth.uid())
  returning id into new_tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role)
  values (new_tenant_id, auth.uid(), 'admin')
  on conflict (tenant_id, user_id) do nothing;

  base_slug := public.slugify(org_name) || '-' || substr(new_tenant_id::text, 1, 8);

  if org_kind = 'independent_doctor' then
    insert into public.provider_profiles (
      user_id,
      display_name,
      specialty,
      practice_tenant_id
    ) values (
      auth.uid(),
      coalesce(nullif(trim(full_name_input), ''), 'Doctor'),
      'General Practice',
      new_tenant_id
    ) returning id into doctor_profile_id;

    insert into public.directory_entities (
      entity_type,
      tenant_id,
      provider_id,
      slug,
      name,
      specialty,
      location,
      description
    ) values (
      'doctor',
      new_tenant_id,
      doctor_profile_id,
      base_slug,
      coalesce(nullif(trim(full_name_input), ''), 'Doctor'),
      'General Practice',
      null,
      'Independent provider profile on OpenMD'
    );
  elsif org_kind = 'facility' then
    insert into public.directory_entities (
      entity_type,
      tenant_id,
      slug,
      name,
      location,
      description
    ) values (
      'facility',
      new_tenant_id,
      base_slug,
      org_name,
      null,
      'Facility profile on OpenMD'
    );
  else
    insert into public.directory_entities (
      entity_type,
      tenant_id,
      slug,
      name,
      location,
      description
    ) values (
      'practice',
      new_tenant_id,
      base_slug,
      org_name,
      null,
      'Practice profile on OpenMD'
    );
  end if;

  return new_tenant_id;
end;
$$;

create or replace function public.create_tenant_invite(target_tenant uuid, invite_email text, invite_role public.tenant_role)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_token text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  if public.current_tenant_role(target_tenant) <> 'admin' then
    raise exception 'Only admins can invite users';
  end if;

  generated_token :=
    md5(random()::text || clock_timestamp()::text || auth.uid()::text || lower(trim(invite_email))) ||
    md5(clock_timestamp()::text || random()::text || lower(trim(invite_email)));

  insert into public.tenant_invites (tenant_id, email, role, invite_token, invited_by)
  values (target_tenant, lower(trim(invite_email)), invite_role, generated_token, auth.uid());

  return generated_token;
end;
$$;

create or replace function public.accept_tenant_invite(invite_token_input text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.tenant_invites;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select * into invite_row
  from public.tenant_invites ti
  where ti.invite_token = invite_token_input
    and ti.status = 'pending'
    and ti.expires_at > now()
    and ti.email = lower((select email from public.profiles where id = auth.uid()))
  order by ti.created_at desc
  limit 1;

  if invite_row.id is null then
    raise exception 'Invite is invalid or expired';
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, role, invited_by)
  values (invite_row.tenant_id, auth.uid(), invite_row.role, invite_row.invited_by)
  on conflict (tenant_id, user_id)
  do update set role = excluded.role;

  update public.tenant_invites
  set status = 'accepted'
  where id = invite_row.id;

  return invite_row.tenant_id;
end;
$$;

create or replace function public.recalculate_entity_rating()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.directory_entities de
  set
    average_rating = coalesce((
      select round(avg(dr.star_rating)::numeric, 2)
      from public.directory_reviews dr
      where dr.entity_id = coalesce(new.entity_id, old.entity_id)
    ), 0),
    rating_count = (
      select count(*)
      from public.directory_reviews dr
      where dr.entity_id = coalesce(new.entity_id, old.entity_id)
    )
  where de.id = coalesce(new.entity_id, old.entity_id);

  return null;
end;
$$;

create trigger trg_recalculate_entity_rating
  after insert or update or delete on public.directory_reviews
  for each row execute function public.recalculate_entity_rating();

create or replace function public.enqueue_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_provider_user uuid;
  provider_name text;
  requester_name text;
begin
  select pp.user_id, pp.display_name into target_provider_user, provider_name
  from public.provider_profiles pp
  where pp.id = new.provider_id;

  select t.name into requester_name
  from public.tenants t
  where t.id = new.requesting_tenant_id;

  if tg_op = 'INSERT' and target_provider_user is not null then
    insert into public.notifications (user_id, tenant_id, type, title, body, action_url, metadata)
    values (
      target_provider_user,
      new.requesting_tenant_id,
      'booking_request',
      'New booking request',
      coalesce(requester_name, 'A facility') || ' requested ' || coalesce(provider_name, 'your') || ' availability.',
      '/bookings',
      jsonb_build_object('booking_request_id', new.id)
    );
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status and new.requested_by is not null then
    insert into public.notifications (user_id, tenant_id, type, title, body, action_url, metadata)
    values (
      new.requested_by,
      new.requesting_tenant_id,
      'booking_status',
      'Booking status updated',
      'A booking request moved to ' || new.status::text || '.',
      '/bookings',
      jsonb_build_object('booking_request_id', new.id, 'status', new.status::text)
    );
  end if;

  return new;
end;
$$;

create trigger trg_booking_notifications
after insert or update on public.booking_requests
for each row execute function public.enqueue_booking_notifications();

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.tenant_invites enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.provider_facility_links enable row level security;
alter table public.provider_availability enable row level security;
alter table public.provider_time_off enable row level security;
alter table public.booking_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.directory_entities enable row level security;
alter table public.directory_reviews enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "tenants_select_member" on public.tenants
  for select using (public.is_tenant_member(id));

create policy "tenants_insert_owner" on public.tenants
  for insert with check (owner_user_id = auth.uid());

create policy "tenant_memberships_select_own_or_admin" on public.tenant_memberships
  for select using (
    user_id = auth.uid()
    or public.current_tenant_role(tenant_id) = 'admin'
  );

create policy "tenant_memberships_manage_admin" on public.tenant_memberships
  for all using (public.current_tenant_role(tenant_id) = 'admin')
  with check (public.current_tenant_role(tenant_id) = 'admin');

create policy "tenant_invites_select_member" on public.tenant_invites
  for select using (public.is_tenant_member(tenant_id));

create policy "tenant_invites_manage_admin" on public.tenant_invites
  for all using (public.current_tenant_role(tenant_id) = 'admin')
  with check (public.current_tenant_role(tenant_id) = 'admin');

create policy "provider_profiles_select_public_or_member" on public.provider_profiles
  for select using (
    is_public
    or user_id = auth.uid()
    or (practice_tenant_id is not null and public.is_tenant_member(practice_tenant_id))
  );

create policy "provider_profiles_insert_member" on public.provider_profiles
  for insert with check (
    (practice_tenant_id is not null and public.is_tenant_member(practice_tenant_id))
    or user_id = auth.uid()
  );

create policy "provider_profiles_update_member" on public.provider_profiles
  for update using (
    user_id = auth.uid()
    or (practice_tenant_id is not null and public.is_tenant_member(practice_tenant_id))
  )
  with check (
    user_id = auth.uid()
    or (practice_tenant_id is not null and public.is_tenant_member(practice_tenant_id))
  );

create policy "provider_facility_links_select_member" on public.provider_facility_links
  for select using (
    public.can_manage_provider(provider_id)
    or public.is_tenant_member(facility_tenant_id)
  );

create policy "provider_facility_links_manage_member" on public.provider_facility_links
  for all using (
    public.can_manage_provider(provider_id)
    or public.current_tenant_role(facility_tenant_id) in ('admin', 'scheduler')
  )
  with check (
    public.can_manage_provider(provider_id)
    or public.current_tenant_role(facility_tenant_id) in ('admin', 'scheduler')
  );

create policy "provider_availability_select" on public.provider_availability
  for select using (public.can_manage_provider(provider_id));

create policy "provider_availability_manage" on public.provider_availability
  for all using (public.can_manage_provider(provider_id))
  with check (public.can_manage_provider(provider_id));

create policy "provider_time_off_select" on public.provider_time_off
  for select using (public.can_manage_provider(provider_id));

create policy "provider_time_off_manage" on public.provider_time_off
  for all using (public.can_manage_provider(provider_id))
  with check (public.can_manage_provider(provider_id));

create policy "booking_requests_select" on public.booking_requests
  for select using (
    public.is_tenant_member(requesting_tenant_id)
    or public.can_manage_provider(provider_id)
  );

create policy "booking_requests_insert" on public.booking_requests
  for insert with check (
    public.current_tenant_role(requesting_tenant_id) in ('admin', 'scheduler')
    and requested_by = auth.uid()
  );

create policy "booking_requests_update" on public.booking_requests
  for update using (
    public.is_tenant_member(requesting_tenant_id)
    or public.can_manage_provider(provider_id)
  )
  with check (
    public.is_tenant_member(requesting_tenant_id)
    or public.can_manage_provider(provider_id)
  );

create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "directory_entities_select_public" on public.directory_entities
  for select using (is_active or (tenant_id is not null and public.is_tenant_member(tenant_id)));

create policy "directory_entities_manage_member" on public.directory_entities
  for all using (tenant_id is not null and public.is_tenant_member(tenant_id))
  with check (tenant_id is not null and public.is_tenant_member(tenant_id));

create policy "directory_reviews_select_all" on public.directory_reviews
  for select using (true);

create policy "directory_reviews_insert_all" on public.directory_reviews
  for insert with check (true);

create view public.directory_summary as
select
  de.id,
  de.entity_type,
  de.slug,
  de.name,
  de.specialty,
  de.location,
  de.description,
  de.average_rating,
  de.rating_count,
  de.created_at,
  count(dr.id)::int as total_reviews
from public.directory_entities de
left join public.directory_reviews dr on dr.entity_id = de.id
where de.is_active
group by de.id;

grant usage on schema public to anon, authenticated;
grant select on public.directory_summary to anon, authenticated;
grant select on public.directory_entities, public.directory_reviews to anon, authenticated;
grant insert on public.directory_reviews to anon, authenticated;
