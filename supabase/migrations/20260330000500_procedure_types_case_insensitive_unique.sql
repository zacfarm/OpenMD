alter table public.tenant_schedule_procedure_types
  drop constraint if exists tenant_schedule_procedure_types_tenant_id_name_key;

create unique index if not exists idx_tenant_schedule_procedure_types_tenant_name_lower
  on public.tenant_schedule_procedure_types (tenant_id, lower(name));
