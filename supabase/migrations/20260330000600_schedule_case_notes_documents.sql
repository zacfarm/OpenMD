insert into storage.buckets (id, name, public)
values ('schedule-case-documents', 'schedule-case-documents', false)
on conflict (id) do nothing;

create table if not exists public.tenant_schedule_document_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists idx_tenant_schedule_document_types_tenant
  on public.tenant_schedule_document_types (tenant_id, is_active, created_at desc);

create trigger trg_tenant_schedule_document_types_updated_at
before update on public.tenant_schedule_document_types
for each row execute function public.set_updated_at();

alter table public.tenant_schedule_document_types enable row level security;

create policy "tenant_schedule_document_types_select_member" on public.tenant_schedule_document_types
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
  );

create policy "tenant_schedule_document_types_manage_scheduler_roles" on public.tenant_schedule_document_types
  for all to authenticated
  using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  )
  with check (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  );

create table if not exists public.schedule_event_notes (
  id uuid primary key default gen_random_uuid(),
  schedule_event_id uuid not null references public.schedule_events(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  note_body text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_schedule_event_notes_event_created
  on public.schedule_event_notes (schedule_event_id, created_at desc);

alter table public.schedule_event_notes enable row level security;

create policy "schedule_event_notes_select_member" on public.schedule_event_notes
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
  );

create policy "schedule_event_notes_insert_member" on public.schedule_event_notes
  for insert to authenticated with check (
    created_by = auth.uid()
    and public.is_tenant_member(tenant_id)
  );

create table if not exists public.schedule_event_documents (
  id uuid primary key default gen_random_uuid(),
  schedule_event_id uuid not null references public.schedule_events(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_type text not null,
  document_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size_bytes integer,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  uploaded_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_schedule_event_documents_event_created
  on public.schedule_event_documents (schedule_event_id, created_at desc);

alter table public.schedule_event_documents enable row level security;

create policy "schedule_event_documents_select_member" on public.schedule_event_documents
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
  );

create policy "schedule_event_documents_insert_member" on public.schedule_event_documents
  for insert to authenticated with check (
    uploaded_by = auth.uid()
    and public.is_tenant_member(tenant_id)
  );

create policy "schedule_event_documents_delete_member" on public.schedule_event_documents
  for delete to authenticated using (
    public.is_tenant_member(tenant_id)
  );

drop policy if exists schedule_case_documents_upload on storage.objects;
create policy schedule_case_documents_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'schedule-case-documents'
    and exists (
      select 1
      from public.tenants t
      where t.id::text = (storage.foldername(name))[1]
        and public.is_tenant_member(t.id)
    )
  );

drop policy if exists schedule_case_documents_read on storage.objects;
create policy schedule_case_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'schedule-case-documents'
    and exists (
      select 1
      from public.schedule_event_documents sed
      where sed.storage_path = storage.objects.name
        and public.is_tenant_member(sed.tenant_id)
    )
  );

drop policy if exists schedule_case_documents_delete on storage.objects;
create policy schedule_case_documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'schedule-case-documents'
    and exists (
      select 1
      from public.schedule_event_documents sed
      where sed.storage_path = storage.objects.name
        and public.is_tenant_member(sed.tenant_id)
    )
  );
