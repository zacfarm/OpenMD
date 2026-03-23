-- ============================================================
-- Profile Management Expansion
-- Adds:
-- - user_profile_settings (contact, routing, privacy, role-aware fields)
-- - user_security_audit_logs (self-visible security action history)
-- - profile-avatars storage bucket and object policies
-- ============================================================

create table if not exists public.user_profile_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Contact preferences
  phone text,
  timezone text not null default 'UTC',
  preferred_contact text not null default 'email'
    check (preferred_contact in ('email', 'phone', 'in_app')),
  quiet_hours_start time,
  quiet_hours_end time, 

  -- Avatar
  avatar_path text,

  -- Global notification routing controls
  notify_in_app boolean not null default true,
  notify_email boolean not null default true,
  notify_push boolean not null default true,
  notify_sms boolean not null default false,
  digest_frequency text not null default 'realtime'
    check (digest_frequency in ('realtime', 'daily', 'weekly', 'off')),

  -- Privacy controls
  public_profile_visible boolean not null default true,
  show_location boolean not null default true,
  internal_only_contact boolean not null default false,

  -- Role-aware: provider
  provider_npi text,
  provider_license_state text,
  provider_license_number text,
  provider_board_certifications text[] not null default '{}',

  -- Role-aware: billing
  billing_payer_focus text[] not null default '{}',
  billing_certifications text[] not null default '{}',

  -- Role-aware: credentialing
  credentialing_domains text[] not null default '{}',
  credentialing_regions text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_user_profile_settings_updated_at
before update on public.user_profile_settings
for each row execute function public.set_updated_at();

alter table public.user_profile_settings enable row level security;

create policy user_profile_settings_select_own on public.user_profile_settings
  for select using (user_id = auth.uid());

create policy user_profile_settings_insert_own on public.user_profile_settings
  for insert with check (user_id = auth.uid());

create policy user_profile_settings_update_own on public.user_profile_settings
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_profile_settings_delete_own on public.user_profile_settings
  for delete using (user_id = auth.uid());

create table if not exists public.user_security_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_user_security_audit_logs_user_created
  on public.user_security_audit_logs (user_id, created_at desc);

alter table public.user_security_audit_logs enable row level security;

create policy user_security_audit_logs_select_own on public.user_security_audit_logs
  for select using (user_id = auth.uid());

create policy user_security_audit_logs_insert_own on public.user_security_audit_logs
  for insert with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', false)
on conflict (id) do nothing;

drop policy if exists profile_avatars_upload_own on storage.objects;
create policy profile_avatars_upload_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists profile_avatars_select_own on storage.objects;
create policy profile_avatars_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists profile_avatars_update_own on storage.objects;
create policy profile_avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'profile-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists profile_avatars_delete_own on storage.objects;
create policy profile_avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );