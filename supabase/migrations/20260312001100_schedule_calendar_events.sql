create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  billing_claim_id uuid references public.insurance_claims(id) on delete set null,
  title text not null,
  case_identifier text,
  patient_display_name text,
  case_type text,
  status text not null default 'scheduled' check (status in ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  practice_name text,
  facility_name text,
  notes text,
  color_token text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists idx_schedule_events_tenant_window
  on public.schedule_events (tenant_id, starts_at, ends_at);

create index if not exists idx_schedule_events_provider_window
  on public.schedule_events (provider_id, starts_at, ends_at);

create index if not exists idx_schedule_events_status_window
  on public.schedule_events (status, starts_at);

create trigger trg_schedule_events_updated_at
before update on public.schedule_events
for each row execute function public.set_updated_at();

alter table public.schedule_events enable row level security;

create policy "schedule_events_select_tenant_or_assigned_provider" on public.schedule_events
  for select to authenticated using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing', 'billing')
    or exists (
      select 1
      from public.provider_profiles pp
      where pp.id = provider_id
        and pp.user_id = auth.uid()
    )
  );

create policy "schedule_events_insert_scheduler_roles" on public.schedule_events
  for insert to authenticated with check (
    created_by = auth.uid()
    and public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  );

create policy "schedule_events_update_scheduler_roles" on public.schedule_events
  for update to authenticated using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  )
  with check (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  );

grant select, insert, update on public.schedule_events to authenticated;
