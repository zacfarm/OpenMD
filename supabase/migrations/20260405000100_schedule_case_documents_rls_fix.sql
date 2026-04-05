create or replace function public.can_read_schedule_case_document(target_tenant uuid, target_schedule_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_events se
    where se.id = target_schedule_event
      and se.tenant_id = target_tenant
      and (
        public.current_tenant_role(target_tenant) in ('admin', 'facility_manager', 'credentialing', 'billing')
        or exists (
          select 1
          from public.provider_profiles pp
          where pp.id = se.provider_id
            and pp.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_write_schedule_case_document(target_tenant uuid, target_schedule_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_events se
    where se.id = target_schedule_event
      and se.tenant_id = target_tenant
      and (
        public.current_tenant_role(target_tenant) in ('admin', 'facility_manager', 'credentialing')
        or exists (
          select 1
          from public.provider_profiles pp
          where pp.id = se.provider_id
            and pp.user_id = auth.uid()
        )
      )
  );
$$;

drop policy if exists "schedule_event_documents_select_member" on public.schedule_event_documents;
create policy "schedule_event_documents_select_member" on public.schedule_event_documents
  for select to authenticated
  using (
    public.can_read_schedule_case_document(tenant_id, schedule_event_id)
  );

drop policy if exists "schedule_event_documents_insert_member" on public.schedule_event_documents;
create policy "schedule_event_documents_insert_member" on public.schedule_event_documents
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.can_write_schedule_case_document(tenant_id, schedule_event_id)
  );

drop policy if exists "schedule_event_documents_delete_member" on public.schedule_event_documents;
create policy "schedule_event_documents_delete_member" on public.schedule_event_documents
  for delete to authenticated
  using (
    public.can_write_schedule_case_document(tenant_id, schedule_event_id)
  );

drop policy if exists schedule_case_documents_upload on storage.objects;
create policy schedule_case_documents_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'schedule-case-documents'
    and public.can_write_schedule_case_document(
      (storage.foldername(name))[1]::uuid,
      (storage.foldername(name))[2]::uuid
    )
  );

drop policy if exists schedule_case_documents_read on storage.objects;
create policy schedule_case_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'schedule-case-documents'
    and public.can_read_schedule_case_document(
      (storage.foldername(name))[1]::uuid,
      (storage.foldername(name))[2]::uuid
    )
  );

drop policy if exists schedule_case_documents_delete on storage.objects;
create policy schedule_case_documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'schedule-case-documents'
    and public.can_write_schedule_case_document(
      (storage.foldername(name))[1]::uuid,
      (storage.foldername(name))[2]::uuid
    )
  );