-- ============================================================
-- Credential Compliance Automation
--
-- Enhances notify_expiring_credentials() to:
-- 1) send reminders at 90/60/30/7 day thresholds
-- 2) escalate 7-day reminders to tenant admins
-- 3) detect missing required document types and notify staff/admin
-- ============================================================

create or replace function public.notify_expiring_credentials()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  exp_row            record;
  missing_row        record;
  recipient_row      record;
  already_sent       boolean;
  sent_count         integer := 0;
  active_types       text[];
  required_types     text[] := array[
    'DEA License',
    'Medical License',
    'Board Certification',
    'Malpractice Insurance',
    'NPI Registration'
  ];
  missing_types      text[];
begin
  -- 1) Expiring credentials reminders: 90/60/30/7 days
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
      and (c.expires_on - current_date)::integer in (90, 60, 30, 7)
  loop
    -- Provider reminder.
    if exp_row.provider_user_id is not null then
      select exists(
        select 1
        from public.notifications n
        where n.user_id = exp_row.provider_user_id
          and n.type = 'credential_expiring'
          and (n.metadata ->> 'credential_id') = exp_row.cred_id::text
          and (n.metadata ->> 'days_left')::integer = exp_row.days_left
          and coalesce((n.metadata ->> 'escalation')::boolean, false) = false
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
            'audience', 'provider',
            'escalation', false
          )
        );
        sent_count := sent_count + 1;
      end if;
    end if;

    -- General staff reminder.
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
          and coalesce((n.metadata ->> 'escalation')::boolean, false) = false
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
            'audience', 'staff',
            'escalation', false
          )
        );
        sent_count := sent_count + 1;
      end if;
    end loop;

    -- Admin escalation at 7 days.
    if exp_row.days_left = 7 then
      for recipient_row in
        select distinct tm.user_id
        from public.tenant_memberships tm
        where tm.tenant_id = exp_row.tenant_id
          and tm.role = 'admin'
      loop
        select exists(
          select 1
          from public.notifications n
          where n.user_id = recipient_row.user_id
            and n.type = 'credential_expiring'
            and (n.metadata ->> 'credential_id') = exp_row.cred_id::text
            and (n.metadata ->> 'days_left')::integer = exp_row.days_left
            and coalesce((n.metadata ->> 'escalation')::boolean, false) = true
            and date(n.created_at at time zone 'UTC') = current_date
        ) into already_sent;

        if not already_sent then
          insert into public.notifications
            (user_id, tenant_id, type, title, body, action_url, metadata)
          values (
            recipient_row.user_id,
            exp_row.tenant_id,
            'credential_expiring',
            'Escalation: credential expires in 7 days',
            exp_row.provider_name || ': "' || exp_row.document_name || '" (' || exp_row.credential_type ||
              ') requires immediate admin attention before ' || to_char(exp_row.expires_on, 'Mon DD, YYYY'),
            '/credentials',
            jsonb_build_object(
              'credential_id', exp_row.cred_id,
              'provider_id', exp_row.provider_id,
              'days_left', exp_row.days_left,
              'expires_on', exp_row.expires_on::text,
              'audience', 'admin',
              'escalation', true
            )
          );
          sent_count := sent_count + 1;
        end if;
      end loop;
    end if;
  end loop;

  -- 2) Missing documents by provider against required credential types.
  for missing_row in
    select
      pfl.facility_tenant_id as tenant_id,
      pp.id as provider_id,
      coalesce(pp.display_name, 'Provider') as provider_name
    from public.provider_facility_links pfl
    join public.provider_profiles pp on pp.id = pfl.provider_id
  loop
    select coalesce(array_agg(distinct c.credential_type), '{}')
    into active_types
    from public.provider_credentials c
    where c.provider_id = missing_row.provider_id
      and c.tenant_id = missing_row.tenant_id
      and c.status = 'approved'
      and (c.expires_on is null or c.expires_on >= current_date);

    select coalesce(
      array(
        select req
        from unnest(required_types) as req
        where not req = any(active_types)
        order by req
      ),
      '{}'
    ) into missing_types;

    if coalesce(array_length(missing_types, 1), 0) = 0 then
      continue;
    end if;

    -- Staff notification.
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
          and (n.metadata ->> 'missing_kind') = 'missing_document'
          and date(n.created_at at time zone 'UTC') = current_date
      ) into already_sent;

      if not already_sent then
        insert into public.notifications
          (user_id, tenant_id, type, title, body, action_url, metadata)
        values (
          recipient_row.user_id,
          missing_row.tenant_id,
          'credential_missing',
          'Provider missing credential documents',
          missing_row.provider_name || ' is missing required credential document types.',
          '/credentials',
          jsonb_build_object(
            'provider_id', missing_row.provider_id,
            'missing_kind', 'missing_document',
            'missing_document_types', to_jsonb(missing_types)
          )
        );
        sent_count := sent_count + 1;
      end if;
    end loop;

    -- Admin escalation for missing documents.
    for recipient_row in
      select distinct tm.user_id
      from public.tenant_memberships tm
      where tm.tenant_id = missing_row.tenant_id
        and tm.role = 'admin'
    loop
      select exists(
        select 1
        from public.notifications n
        where n.user_id = recipient_row.user_id
          and n.type = 'credential_missing'
          and (n.metadata ->> 'provider_id') = missing_row.provider_id::text
          and (n.metadata ->> 'missing_kind') = 'missing_document_admin_escalation'
          and date(n.created_at at time zone 'UTC') = current_date
      ) into already_sent;

      if not already_sent then
        insert into public.notifications
          (user_id, tenant_id, type, title, body, action_url, metadata)
        values (
          recipient_row.user_id,
          missing_row.tenant_id,
          'credential_missing',
          'Escalation: provider missing required documents',
          missing_row.provider_name || ' is missing required credential document types. Admin action needed.',
          '/credentials',
          jsonb_build_object(
            'provider_id', missing_row.provider_id,
            'missing_kind', 'missing_document_admin_escalation',
            'missing_document_types', to_jsonb(missing_types),
            'escalation', true
          )
        );
        sent_count := sent_count + 1;
      end if;
    end loop;
  end loop;

  return sent_count;
end;
$$;
