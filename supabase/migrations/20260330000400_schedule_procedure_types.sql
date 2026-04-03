create table if not exists public.tenant_schedule_procedure_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists idx_tenant_schedule_procedure_types_tenant
  on public.tenant_schedule_procedure_types (tenant_id, is_active, created_at desc);

create trigger trg_tenant_schedule_procedure_types_updated_at
before update on public.tenant_schedule_procedure_types
for each row execute function public.set_updated_at();

alter table public.tenant_schedule_procedure_types enable row level security;

create policy "tenant_schedule_procedure_types_select_member" on public.tenant_schedule_procedure_types
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
  );

create policy "tenant_schedule_procedure_types_manage_scheduler_roles" on public.tenant_schedule_procedure_types
  for all to authenticated
  using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  )
  with check (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  );

alter table public.schedule_events
  add column if not exists procedure_type_id uuid references public.tenant_schedule_procedure_types(id) on delete set null;

create index if not exists idx_schedule_events_procedure_type_id
  on public.schedule_events (procedure_type_id);
