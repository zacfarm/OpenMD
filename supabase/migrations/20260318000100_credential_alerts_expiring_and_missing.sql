-- ============================================================
-- Credential Alerts: Expiring + Missing Coverage
--
-- Updates notify_expiring_credentials() so daily cron can:
-- 1) notify providers and credentialing staff of expiring credentials
-- 2) notify credentialing staff when providers are missing active credentials


create or replace function public.notify_expiring_credentials()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  exp_row       record;
  missing_row   record;
  recipient_row record;
  already_sent  boolean;
  sent_count    integer := 0;
begin
  -- 1) Expiring credentials: provider + tenant admin/facility_manager/credentialing
  for exp_row in
    select
      c.id as cred_id,
      c.provider_id,
      c.document_name,
      c.credential_type,
      c.tenant_id,
      c.expires_on,
      pp.user_id as provider_user_id,
      coalesce(pp.display_name, 'Provider') as provider_name,
      (c.expires_on - current_date)::integer as days_left
    from public.provider_credentials c
    join public.provider_profiles pp on pp.id = c.provider_id
    where c.status = 'approved'
      and c.expires_on is not null
      and (c.expires_on - current_date)::integer in (30, 7)
  loop
    -- Notify provider (doctor) when available.
    if exp_row.provider_user_id is not null then
      select exists(
        select 1
        from public.notifications n
        where n.user_id = exp_row.provider_user_id
          and n.type = 'credential_expiring'
          and (n.metadata ->> 'credential_id') = exp_row.cred_id::text
          and (n.metadata ->> 'days_left')::integer = exp_row.days_left
          and date(n.created_at at time zone 'UTC') = current_date
      ) into already_sent;

      if not already_sent then
        insert into public.notifications
          (user_id, tenant_id, type, title, body, action_url, metadata)
        values (
          exp_row.provider_user_id,
          exp_row.tenant_id,
          'credential_expiring',
          'Credential expiring in ' || exp_row.days_left || ' days',
          '"' || exp_row.document_name || '" (' || exp_row.credential_type || ') expires on ' ||
            to_char(exp_row.expires_on, 'Mon DD, YYYY'),
          '/credentials',
          jsonb_build_object(
            'credential_id', exp_row.cred_id,
            'provider_id', exp_row.provider_id,
            'days_left', exp_row.days_left,
            'expires_on', exp_row.expires_on::text,
            'audience', 'provider'
          )
        );
        sent_count := sent_count + 1;
      end if;
    end if;

    -- Notify relevant tenant staff.
    for recipient_row in
      select distinct tm.user_id
      from public.tenant_memberships tm
      where tm.tenant_id = exp_row.tenant_id
        and tm.role in ('admin', 'facility_manager', 'credentialing')
    loop
      select exists(
        select 1
        from public.notifications n
        where n.user_id = recipient_row.user_id
          and n.type = 'credential_expiring'
          and (n.metadata ->> 'credential_id') = exp_row.cred_id::text
          and (n.metadata ->> 'days_left')::integer = exp_row.days_left
          and date(n.created_at at time zone 'UTC') = current_date
      ) into already_sent;

      if not already_sent then
        insert into public.notifications
          (user_id, tenant_id, type, title, body, action_url, metadata)
        values (
          recipient_row.user_id,
          exp_row.tenant_id,
          'credential_expiring',
          'Provider credential expiring in ' || exp_row.days_left || ' days',
          exp_row.provider_name || ': "' || exp_row.document_name || '" (' || exp_row.credential_type ||
            ') expires on ' || to_char(exp_row.expires_on, 'Mon DD, YYYY'),
          '/credentials',
          jsonb_build_object(
            'credential_id', exp_row.cred_id,
            'provider_id', exp_row.provider_id,
            'days_left', exp_row.days_left,
            'expires_on', exp_row.expires_on::text,
            'audience', 'staff'
          )
        );
        sent_count := sent_count + 1;
      end if;
    end loop;
  end loop;

  -- 2) Missing credentials: provider has no active approved credential in tenant.
  for missing_row in
    select
      pfl.facility_tenant_id as tenant_id,
      pp.id as provider_id,
      coalesce(pp.display_name, 'Provider') as provider_name
    from public.provider_facility_links pfl
    join public.provider_profiles pp on pp.id = pfl.provider_id
    where not exists (
      select 1
      from public.provider_credentials c
      where c.provider_id = pfl.provider_id
        and c.tenant_id = pfl.facility_tenant_id
        and c.status = 'approved'
        and (c.expires_on is null or c.expires_on >= current_date)
    )
  loop
    for recipient_row in
      select distinct tm.user_id
      from public.tenant_memberships tm
      where tm.tenant_id = missing_row.tenant_id
        and tm.role in ('admin', 'facility_manager', 'credentialing')
    loop
      select exists(
        select 1
        from public.notifications n
        where n.user_id = recipient_row.user_id
          and n.type = 'credential_missing'
          and (n.metadata ->> 'provider_id') = missing_row.provider_id::text
          and date(n.created_at at time zone 'UTC') = current_date
      ) into already_sent;

      if not already_sent then
        insert into public.notifications
          (user_id, tenant_id, type, title, body, action_url, metadata)
        values (
          recipient_row.user_id,
          missing_row.tenant_id,
          'credential_missing',
          'Provider missing active credentials',
          missing_row.provider_name || ' has no approved active credentials on file.',
          '/credentials',
          jsonb_build_object(
            'provider_id', missing_row.provider_id,
            'missing_kind', 'no_active_approved_credentials'
          )
        );
        sent_count := sent_count + 1;
      end if;
    end loop;
  end loop;

  return sent_count;
end;
$$;
