alter table public.schedule_events
  alter column provider_id drop not null;

create policy "marketplace_update_tenant_roles" on public.marketplace_posts
  for update to authenticated
  using (
    created_by = auth.uid()
    or (
      tenant_id is not null
      and public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
    )
  )
  with check (
    created_by = auth.uid()
    or (
      tenant_id is not null
      and public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
    )
  );

create policy "marketplace_delete_tenant_roles" on public.marketplace_posts
  for delete to authenticated
  using (
    created_by = auth.uid()
    or (
      tenant_id is not null
      and public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
    )
  );

drop policy if exists "schedule_events_insert_creator_roles" on public.schedule_events;

create policy "schedule_events_insert_creator_roles" on public.schedule_events
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
      or public.current_tenant_role(tenant_id) = 'doctor'
    )
    and (
      provider_id is null
      or exists (
        select 1
        from public.provider_profiles pp
        where pp.id = provider_id
          and (
            public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
            or pp.user_id = auth.uid()
          )
      )
    )
  );

drop policy if exists "schedule_events_update_creator_roles" on public.schedule_events;

create policy "schedule_events_update_creator_roles" on public.schedule_events
  for update to authenticated
  using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
    or (
      public.current_tenant_role(tenant_id) = 'doctor'
      and (
        provider_id is null
        or exists (
          select 1
          from public.provider_profiles pp
          where pp.id = provider_id
            and pp.user_id = auth.uid()
        )
      )
    )
  )
  with check (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
    or (
      public.current_tenant_role(tenant_id) = 'doctor'
      and (
        provider_id is null
        or exists (
          select 1
          from public.provider_profiles pp
          where pp.id = provider_id
            and pp.user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "schedule_events_delete_creator_roles" on public.schedule_events;

create policy "schedule_events_delete_creator_roles" on public.schedule_events
  for delete to authenticated
  using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
    or (
      public.current_tenant_role(tenant_id) = 'doctor'
      and (
        provider_id is null
        or exists (
          select 1
          from public.provider_profiles pp
          where pp.id = provider_id
            and pp.user_id = auth.uid()
        )
      )
    )
  );

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
      case_type,
      status,
      starts_at,
      ends_at,
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
      upper(left(updated_row.id::text, 8)),
      case
        when updated_row.post_type = 'facility_request' then 'Marketplace request'
        else 'Provider availability'
      end,
      'confirmed',
      updated_row.starts_at,
      updated_row.ends_at,
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
      case_type,
      status,
      starts_at,
      ends_at,
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
      upper(left(updated_row.id::text, 8)),
      case
        when updated_row.post_type = 'facility_request' then 'Marketplace request'
        else 'Provider availability'
      end,
      'confirmed',
      updated_row.starts_at,
      updated_row.ends_at,
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
