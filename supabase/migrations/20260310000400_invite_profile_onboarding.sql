

create or replace function public.accept_tenant_invite(invite_token_input text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.tenant_invites;
  current_full_name text;
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select p.full_name, p.email
    into current_full_name, current_email
  from public.profiles p
  where p.id = auth.uid();

  select * into invite_row
  from public.tenant_invites ti
  where ti.invite_token = invite_token_input
    and ti.status = 'pending'
    and ti.expires_at > now()
    and ti.email = lower(coalesce(current_email, ''))
  order by ti.created_at desc
  limit 1;

  if invite_row.id is null then
    raise exception 'Invite is invalid or expired';
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, role, invited_by)
  values (invite_row.tenant_id, auth.uid(), invite_row.role, invite_row.invited_by)
  on conflict (tenant_id, user_id)
  do update set role = excluded.role;

  -- Auto-create provider profile for invited providers.
  if invite_row.role = 'doctor' then
    insert into public.provider_profiles (
      user_id,
      display_name,
      specialty,
      practice_tenant_id,
      is_public
    )
    values (
      auth.uid(),
      coalesce(nullif(trim(current_full_name), ''), split_part(coalesce(current_email, 'Provider'), '@', 1), 'Provider'),
      null,
      invite_row.tenant_id,
      true
    )
    on conflict (user_id)
    do nothing;
  end if;

  update public.tenant_invites
  set status = 'accepted'
  where id = invite_row.id;

  return invite_row.tenant_id;
end;
$$;
