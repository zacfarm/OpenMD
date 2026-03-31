alter table public.marketplace_posts
  add column if not exists patient_first_name text,
  add column if not exists patient_last_name text,
  add column if not exists patient_address_line_1 text,
  add column if not exists patient_city text,
  add column if not exists patient_state text,
  add column if not exists patient_zip text,
  add column if not exists patient_sex text check (patient_sex in ('male', 'female')),
  add column if not exists visit_type text check (visit_type in ('inpatient', 'outpatient')),
  add column if not exists location_id uuid references public.tenant_schedule_locations(id) on delete set null,
  add column if not exists insurance_company_id uuid references public.tenant_schedule_insurance_companies(id) on delete set null,
  add column if not exists procedure_type_id uuid references public.tenant_schedule_procedure_types(id) on delete set null;

create index if not exists idx_marketplace_posts_location_id
  on public.marketplace_posts (location_id);

create index if not exists idx_marketplace_posts_insurance_company_id
  on public.marketplace_posts (insurance_company_id);

create index if not exists idx_marketplace_posts_procedure_type_id
  on public.marketplace_posts (procedure_type_id);

create or replace function public.claim_marketplace_post(post_id uuid)
returns public.marketplace_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.marketplace_posts;
  caller_tenant_id uuid;
  caller_provider_id uuid;
  event_tenant_id uuid;
  event_provider_id uuid;
  event_tenant_name text;
  event_tenant_org_type text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select tm.tenant_id into caller_tenant_id
  from public.tenant_memberships tm
  where tm.user_id = auth.uid()
  order by tm.created_at asc
  limit 1;

  select pp.id into caller_provider_id
  from public.provider_profiles pp
  where pp.user_id = auth.uid()
  order by pp.created_at asc
  limit 1;

  update public.marketplace_posts mp
  set
    status = 'claimed',
    claimed_by_user_id = auth.uid(),
    claimed_at = now(),
    provider_id = coalesce(mp.provider_id, caller_provider_id)
  where mp.id = post_id
    and mp.status = 'open'
  returning mp.* into updated_row;

  if updated_row.id is null then
    raise exception 'Post is no longer open';
  end if;

  if updated_row.post_type = 'facility_request' then
    event_tenant_id := updated_row.tenant_id;
    event_provider_id := coalesce(updated_row.provider_id, caller_provider_id);
  else
    event_tenant_id := coalesce(caller_tenant_id, updated_row.tenant_id);
    event_provider_id := updated_row.provider_id;
  end if;

  if exists (
    select 1
    from public.schedule_events se
    where se.metadata->>'marketplace_post_id' = updated_row.id::text
  ) then
    update public.schedule_events se
    set
      provider_id = coalesce(se.provider_id, event_provider_id),
      title = coalesce(se.title, updated_row.title),
      patient_display_name = coalesce(se.patient_display_name, concat_ws(', ', nullif(updated_row.patient_last_name, ''), nullif(updated_row.patient_first_name, ''))),
      patient_first_name = coalesce(se.patient_first_name, updated_row.patient_first_name),
      patient_last_name = coalesce(se.patient_last_name, updated_row.patient_last_name),
      patient_address_line_1 = coalesce(se.patient_address_line_1, updated_row.patient_address_line_1),
      patient_city = coalesce(se.patient_city, updated_row.patient_city),
      patient_state = coalesce(se.patient_state, updated_row.patient_state),
      patient_zip = coalesce(se.patient_zip, updated_row.patient_zip),
      patient_sex = coalesce(se.patient_sex, updated_row.patient_sex),
      visit_type = coalesce(se.visit_type, updated_row.visit_type),
      procedure_type_id = coalesce(se.procedure_type_id, updated_row.procedure_type_id),
      case_type = coalesce(se.case_type, updated_row.specialty),
      location_id = coalesce(se.location_id, updated_row.location_id),
      insurance_company_id = coalesce(se.insurance_company_id, updated_row.insurance_company_id),
      location = coalesce(se.location, updated_row.location),
      notes = coalesce(se.notes, updated_row.details),
      status = case when se.status in ('scheduled', 'confirmed') then 'confirmed' else se.status end,
      updated_by = auth.uid()
    where se.metadata->>'marketplace_post_id' = updated_row.id::text;
  elsif updated_row.starts_at is not null
     and updated_row.ends_at is not null
     and event_tenant_id is not null
     and event_provider_id is not null
  then
    select t.name, t.org_type
      into event_tenant_name, event_tenant_org_type
    from public.tenants t
    where t.id = event_tenant_id;

    insert into public.schedule_events (
      tenant_id,
      provider_id,
      title,
      case_identifier,
      patient_display_name,
      patient_first_name,
      patient_last_name,
      patient_address_line_1,
      patient_city,
      patient_state,
      patient_zip,
      patient_sex,
      visit_type,
      procedure_type_id,
      case_type,
      status,
      starts_at,
      ends_at,
      location_id,
      insurance_company_id,
      location,
      practice_name,
      facility_name,
      notes,
      metadata,
      created_by,
      updated_by
    )
    values (
      event_tenant_id,
      event_provider_id,
      updated_row.title,
      'CASE-' || right(replace(updated_row.id::text, '-', ''), 8),
      concat_ws(', ', nullif(updated_row.patient_last_name, ''), nullif(updated_row.patient_first_name, '')),
      updated_row.patient_first_name,
      updated_row.patient_last_name,
      updated_row.patient_address_line_1,
      updated_row.patient_city,
      updated_row.patient_state,
      updated_row.patient_zip,
      updated_row.patient_sex,
      updated_row.visit_type,
      updated_row.procedure_type_id,
      coalesce(updated_row.specialty, case when updated_row.post_type = 'facility_request' then 'Marketplace request' else 'Provider availability' end),
      'confirmed',
      updated_row.starts_at,
      updated_row.ends_at,
      updated_row.location_id,
      updated_row.insurance_company_id,
      updated_row.location,
      case when event_tenant_org_type = 'practice' then event_tenant_name else null end,
      case when event_tenant_org_type = 'facility' then event_tenant_name else null end,
      updated_row.details,
      jsonb_build_object(
        'source', 'marketplace_post',
        'marketplace_post_id', updated_row.id::text,
        'post_type', updated_row.post_type
      ),
      auth.uid(),
      auth.uid()
    );
  end if;

  return updated_row;
end;
$$;

create or replace function public.claim_marketplace_post_text(post_id_input text)
returns public.marketplace_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.marketplace_posts;
  caller_tenant_id uuid;
  caller_provider_id uuid;
  event_tenant_id uuid;
  event_provider_id uuid;
  event_tenant_name text;
  event_tenant_org_type text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select tm.tenant_id into caller_tenant_id
  from public.tenant_memberships tm
  where tm.user_id = auth.uid()
  order by tm.created_at asc
  limit 1;

  select pp.id into caller_provider_id
  from public.provider_profiles pp
  where pp.user_id = auth.uid()
  order by pp.created_at asc
  limit 1;

  update public.marketplace_posts mp
  set
    status = 'claimed',
    claimed_by_user_id = auth.uid(),
    claimed_at = now(),
    provider_id = coalesce(mp.provider_id, caller_provider_id)
  where mp.id::text = post_id_input
    and mp.status = 'open'
  returning mp.* into updated_row;

  if updated_row.id is null then
    raise exception 'Post is no longer open';
  end if;

  if updated_row.post_type = 'facility_request' then
    event_tenant_id := updated_row.tenant_id;
    event_provider_id := coalesce(updated_row.provider_id, caller_provider_id);
  else
    event_tenant_id := coalesce(caller_tenant_id, updated_row.tenant_id);
    event_provider_id := updated_row.provider_id;
  end if;

  if exists (
    select 1
    from public.schedule_events se
    where se.metadata->>'marketplace_post_id' = updated_row.id::text
  ) then
    update public.schedule_events se
    set
      provider_id = coalesce(se.provider_id, event_provider_id),
      title = coalesce(se.title, updated_row.title),
      patient_display_name = coalesce(se.patient_display_name, concat_ws(', ', nullif(updated_row.patient_last_name, ''), nullif(updated_row.patient_first_name, ''))),
      patient_first_name = coalesce(se.patient_first_name, updated_row.patient_first_name),
      patient_last_name = coalesce(se.patient_last_name, updated_row.patient_last_name),
      patient_address_line_1 = coalesce(se.patient_address_line_1, updated_row.patient_address_line_1),
      patient_city = coalesce(se.patient_city, updated_row.patient_city),
      patient_state = coalesce(se.patient_state, updated_row.patient_state),
      patient_zip = coalesce(se.patient_zip, updated_row.patient_zip),
      patient_sex = coalesce(se.patient_sex, updated_row.patient_sex),
      visit_type = coalesce(se.visit_type, updated_row.visit_type),
      procedure_type_id = coalesce(se.procedure_type_id, updated_row.procedure_type_id),
      case_type = coalesce(se.case_type, updated_row.specialty),
      location_id = coalesce(se.location_id, updated_row.location_id),
      insurance_company_id = coalesce(se.insurance_company_id, updated_row.insurance_company_id),
      location = coalesce(se.location, updated_row.location),
      notes = coalesce(se.notes, updated_row.details),
      status = case when se.status in ('scheduled', 'confirmed') then 'confirmed' else se.status end,
      updated_by = auth.uid()
    where se.metadata->>'marketplace_post_id' = updated_row.id::text;
  elsif updated_row.starts_at is not null
     and updated_row.ends_at is not null
     and event_tenant_id is not null
     and event_provider_id is not null
  then
    select t.name, t.org_type
      into event_tenant_name, event_tenant_org_type
    from public.tenants t
    where t.id = event_tenant_id;

    insert into public.schedule_events (
      tenant_id,
      provider_id,
      title,
      case_identifier,
      patient_display_name,
      patient_first_name,
      patient_last_name,
      patient_address_line_1,
      patient_city,
      patient_state,
      patient_zip,
      patient_sex,
      visit_type,
      procedure_type_id,
      case_type,
      status,
      starts_at,
      ends_at,
      location_id,
      insurance_company_id,
      location,
      practice_name,
      facility_name,
      notes,
      metadata,
      created_by,
      updated_by
    )
    values (
      event_tenant_id,
      event_provider_id,
      updated_row.title,
      'CASE-' || right(replace(updated_row.id::text, '-', ''), 8),
      concat_ws(', ', nullif(updated_row.patient_last_name, ''), nullif(updated_row.patient_first_name, '')),
      updated_row.patient_first_name,
      updated_row.patient_last_name,
      updated_row.patient_address_line_1,
      updated_row.patient_city,
      updated_row.patient_state,
      updated_row.patient_zip,
      updated_row.patient_sex,
      updated_row.visit_type,
      updated_row.procedure_type_id,
      coalesce(updated_row.specialty, case when updated_row.post_type = 'facility_request' then 'Marketplace request' else 'Provider availability' end),
      'confirmed',
      updated_row.starts_at,
      updated_row.ends_at,
      updated_row.location_id,
      updated_row.insurance_company_id,
      updated_row.location,
      case when event_tenant_org_type = 'practice' then event_tenant_name else null end,
      case when event_tenant_org_type = 'facility' then event_tenant_name else null end,
      updated_row.details,
      jsonb_build_object(
        'source', 'marketplace_post',
        'marketplace_post_id', updated_row.id::text,
        'post_type', updated_row.post_type
      ),
      auth.uid(),
      auth.uid()
    );
  end if;

  return updated_row;
end;
$$;
