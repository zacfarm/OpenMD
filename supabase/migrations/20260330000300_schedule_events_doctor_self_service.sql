drop policy if exists "schedule_events_insert_scheduler_roles" on public.schedule_events;

create policy "schedule_events_insert_creator_roles" on public.schedule_events
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
      or (
        public.current_tenant_role(tenant_id) = 'doctor'
        and exists (
          select 1
          from public.provider_profiles pp
          where pp.id = provider_id
            and pp.user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "schedule_events_update_scheduler_roles" on public.schedule_events;

create policy "schedule_events_update_creator_roles" on public.schedule_events
  for update to authenticated
  using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
    or (
      public.current_tenant_role(tenant_id) = 'doctor'
      and exists (
        select 1
        from public.provider_profiles pp
        where pp.id = provider_id
          and pp.user_id = auth.uid()
      )
    )
  )
  with check (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
    or (
      public.current_tenant_role(tenant_id) = 'doctor'
      and exists (
        select 1
        from public.provider_profiles pp
        where pp.id = provider_id
          and pp.user_id = auth.uid()
      )
    )
  );

create policy "schedule_events_delete_creator_roles" on public.schedule_events
  for delete to authenticated
  using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
    or (
      public.current_tenant_role(tenant_id) = 'doctor'
      and exists (
        select 1
        from public.provider_profiles pp
        where pp.id = provider_id
          and pp.user_id = auth.uid()
      )
    )
  );
