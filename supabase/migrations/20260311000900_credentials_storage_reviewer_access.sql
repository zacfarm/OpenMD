-- Allow credential reviewers to read credential files from storage.
-- This fixes facility/admin "View" failures when opening provider documents.

drop policy if exists "credentials_reviewer_read" on storage.objects;

create policy "credentials_reviewer_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'credentials'
    and exists (
      select 1
      from public.provider_credentials pc
      where pc.storage_path = storage.objects.name
        and public.current_tenant_role(pc.tenant_id) in ('admin', 'facility_manager', 'credentialing')
    )
  );
