-- Restrict credential review actions to facility-side admin roles only.
-- This removes scheduler/credentialing review privileges.

create or replace function public.review_credential(
  p_credential_id uuid,
  p_status        public.credential_status,
  p_notes         text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_caller_role public.tenant_role;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select tenant_id into v_tenant_id
  from public.provider_credentials
  where id = p_credential_id;

  if v_tenant_id is null then
    raise exception 'Credential not found';
  end if;

  v_caller_role := public.current_tenant_role(v_tenant_id);

  if v_caller_role not in ('admin', 'facility_manager') then
    raise exception 'Only facility admins can review credentials';
  end if;

  update public.provider_credentials
  set status = p_status,
      notes  = coalesce(p_notes, notes)
  where id = p_credential_id;
end;
$$;

drop policy if exists "credentials_update_reviewer" on public.provider_credentials;
create policy "credentials_update_reviewer" on public.provider_credentials
  for update to authenticated using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager')
  ) with check (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager')
  );

drop policy if exists "credentials_reviewer_read" on storage.objects;
create policy "credentials_reviewer_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'credentials'
    and exists (
      select 1
      from public.provider_credentials pc
      where pc.storage_path = storage.objects.name
        and public.current_tenant_role(pc.tenant_id) in ('admin', 'facility_manager')
    )
  );

create or replace function public.tenant_role_has_permission(
  p_role       public.tenant_role,
  p_permission text
)
returns boolean
language plpgsql
immutable
as $$
begin
  return case p_permission
    when 'view_dashboard'          then p_role in ('admin','doctor','facility_manager','billing','credentialing')
    when 'view_bookings'           then p_role in ('admin','doctor','facility_manager','billing','credentialing')
    when 'create_booking'          then p_role in ('admin','doctor','facility_manager','credentialing')
    when 'manage_bookings'         then p_role in ('admin','facility_manager','credentialing')
    when 'view_providers'          then p_role in ('admin','doctor','facility_manager','billing','credentialing')
    when 'manage_providers'        then p_role in ('admin','facility_manager','credentialing')
    when 'view_billing'            then p_role in ('admin','facility_manager','billing')
    when 'manage_billing'          then p_role in ('admin','billing')
    when 'view_credentials'        then p_role in ('admin','doctor','facility_manager')
    when 'manage_credentials'      then p_role in ('admin','facility_manager')
    when 'view_notifications'      then p_role in ('admin','doctor','facility_manager','billing','credentialing')
    when 'manage_team'             then p_role in ('admin','facility_manager')
    when 'view_marketplace'        then p_role in ('admin','doctor','facility_manager','billing','credentialing')
    when 'create_marketplace_post' then p_role in ('admin','doctor','facility_manager','credentialing')
    when 'manage_availability'     then p_role in ('admin','doctor','facility_manager','credentialing')
    else false
  end;
end;
$$;
