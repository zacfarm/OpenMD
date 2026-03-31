create table if not exists public.tenant_schedule_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state text not null,
  zip text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_schedule_locations_tenant
  on public.tenant_schedule_locations (tenant_id, is_active, created_at desc);

create trigger trg_tenant_schedule_locations_updated_at
before update on public.tenant_schedule_locations
for each row execute function public.set_updated_at();

alter table public.tenant_schedule_locations enable row level security;

create policy "tenant_schedule_locations_select_member" on public.tenant_schedule_locations
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
  );

create policy "tenant_schedule_locations_manage_scheduler_roles" on public.tenant_schedule_locations
  for all to authenticated
  using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  )
  with check (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  );

create table if not exists public.tenant_schedule_insurance_companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  payer_code text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_schedule_insurance_tenant
  on public.tenant_schedule_insurance_companies (tenant_id, is_active, created_at desc);

create trigger trg_tenant_schedule_insurance_updated_at
before update on public.tenant_schedule_insurance_companies
for each row execute function public.set_updated_at();

alter table public.tenant_schedule_insurance_companies enable row level security;

create policy "tenant_schedule_insurance_select_member" on public.tenant_schedule_insurance_companies
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
  );

create policy "tenant_schedule_insurance_manage_scheduler_roles" on public.tenant_schedule_insurance_companies
  for all to authenticated
  using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  )
  with check (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  );

alter table public.schedule_events
  add column if not exists patient_first_name text,
  add column if not exists patient_last_name text,
  add column if not exists patient_address_line_1 text,
  add column if not exists patient_city text,
  add column if not exists patient_state text,
  add column if not exists patient_zip text,
  add column if not exists patient_sex text check (patient_sex in ('male', 'female')),
  add column if not exists visit_type text check (visit_type in ('inpatient', 'outpatient')),
  add column if not exists location_id uuid references public.tenant_schedule_locations(id) on delete set null,
  add column if not exists insurance_company_id uuid references public.tenant_schedule_insurance_companies(id) on delete set null;

create index if not exists idx_schedule_events_location_id
  on public.schedule_events (location_id);

create index if not exists idx_schedule_events_insurance_company_id
  on public.schedule_events (insurance_company_id);
