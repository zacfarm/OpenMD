-- ============================================================
-- Notification Triggers
-- Fires on: booking_requests, marketplace_posts,
--           provider_credentials, credential_status_history,
--           tenant_invites, tenant_memberships, insurance_claims
-- ============================================================

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;

-- Users read their own notifications
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());

-- Users mark their own notifications as read
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid());

-- ──────────────────────────────────────────────
-- Helpers
-- ──────────────────────────────────────────────

-- Insert one notification for a single user
create or replace function public.insert_notification(
  p_user_id    uuid,
  p_tenant_id  uuid,
  p_type       text,
  p_title      text,
  p_body       text,
  p_action_url text    default null,
  p_metadata   jsonb   default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications
    (user_id, tenant_id, type, title, body, action_url, metadata)
  values
    (p_user_id, p_tenant_id, p_type, p_title, p_body, p_action_url, p_metadata);
end;
$$;

-- Notify all admin / facility_manager members of a tenant
create or replace function public.notify_tenant_admins(
  p_tenant_id       uuid,
  p_type            text,
  p_title           text,
  p_body            text,
  p_action_url      text  default null,
  p_metadata        jsonb default '{}'::jsonb,
  p_exclude_user_id uuid  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select user_id
    from public.tenant_memberships
    where tenant_id = p_tenant_id
      and role in ('admin', 'facility_manager')
      and (p_exclude_user_id is null or user_id != p_exclude_user_id)
  loop
    insert into public.notifications
      (user_id, tenant_id, type, title, body, action_url, metadata)
    values
      (r.user_id, p_tenant_id, p_type, p_title, p_body, p_action_url, p_metadata);
  end loop;
end;
$$;

-- Notify all members of a tenant matching one or more roles.
create or replace function public.notify_tenant_roles(
  p_tenant_id       uuid,
  p_roles           text[],
  p_type            text,
  p_title           text,
  p_body            text,
  p_action_url      text  default null,
  p_metadata        jsonb default '{}'::jsonb,
  p_exclude_user_id uuid  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select distinct user_id
    from public.tenant_memberships
    where tenant_id = p_tenant_id
      and role::text = any (p_roles)
      and (p_exclude_user_id is null or user_id != p_exclude_user_id)
  loop
    insert into public.notifications
      (user_id, tenant_id, type, title, body, action_url, metadata)
    values
      (r.user_id, p_tenant_id, p_type, p_title, p_body, p_action_url, p_metadata);
  end loop;
end;
$$;

-- ──────────────────────────────────────────────
-- BOOKING REQUESTS — new booking created
-- ──────────────────────────────────────────────

create or replace function public.trg_fn_booking_requested()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_user_id uuid;
  provider_name    text;
  tenant_name      text;
begin
  select pp.user_id, pp.display_name
    into provider_user_id, provider_name
  from public.provider_profiles pp
  where pp.id = new.provider_id;

  select t.name into tenant_name
  from public.tenants t
  where t.id = new.requesting_tenant_id;

  -- Notify the provider
  if provider_user_id is not null then
    perform public.insert_notification(
      provider_user_id,
      null,
      'booking_requested',
      'New booking request',
      coalesce(tenant_name, 'A facility') || ' has requested a booking for ' ||
        to_char(new.requested_start at time zone 'UTC', 'Mon DD, YYYY'),
      '/bookings',
      jsonb_build_object('booking_id', new.id, 'requesting_tenant_id', new.requesting_tenant_id)
    );
  end if;

  -- Notify tenant booking managers and schedulers.
  perform public.notify_tenant_roles(
    new.requesting_tenant_id,
    array['admin', 'facility_manager', 'credentialing'],
    'booking_requested',
    'Booking request submitted',
    'A booking was requested with ' || coalesce(provider_name, 'a provider') || ' on ' ||
      to_char(new.requested_start at time zone 'UTC', 'Mon DD, YYYY'),
    '/bookings',
    jsonb_build_object('booking_id', new.id, 'provider_id', new.provider_id),
    new.requested_by
  );

  return new;
end;
$$;

drop trigger if exists trg_booking_requested on public.booking_requests;

create trigger trg_booking_requested
after insert on public.booking_requests
for each row execute function public.trg_fn_booking_requested();

-- ──────────────────────────────────────────────
-- BOOKING REQUESTS — status changed
-- ──────────────────────────────────────────────

create or replace function public.trg_fn_booking_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r             record;
  provider_name text;
  status_label  text;
  prov_user_id  uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  select pp.display_name, pp.user_id
    into provider_name, prov_user_id
  from public.provider_profiles pp
  where pp.id = new.provider_id;

  status_label := case new.status
    when 'accepted'  then 'accepted'
    when 'declined'  then 'declined'
    when 'confirmed' then 'confirmed'
    when 'canceled'  then 'canceled'
    else new.status::text
  end;

  -- Notify all members of the requesting tenant (skip whoever triggered the change)
  for r in
    select user_id
    from public.tenant_memberships
    where tenant_id = new.requesting_tenant_id
      and (new.responded_by is null or user_id != new.responded_by)
  loop
    perform public.insert_notification(
      r.user_id,
      new.requesting_tenant_id,
      'booking_status_changed',
      'Booking ' || status_label,
      'Your booking request with ' || coalesce(provider_name, 'a provider') || ' has been ' || status_label,
      '/bookings',
      jsonb_build_object('booking_id', new.id, 'status', new.status)
    );
  end loop;

  -- Also notify the provider if the booking was canceled by the tenant
  if new.status = 'canceled' and prov_user_id is not null
     and (new.responded_by is null or prov_user_id != new.responded_by) then
    perform public.insert_notification(
      prov_user_id,
      null,
      'booking_status_changed',
      'Booking canceled',
      'A booking on ' || to_char(new.requested_start at time zone 'UTC', 'Mon DD, YYYY') ||
        ' has been canceled',
      '/bookings',
      jsonb_build_object('booking_id', new.id, 'status', new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_booking_status_changed on public.booking_requests;

create trigger trg_booking_status_changed
after update on public.booking_requests
for each row execute function public.trg_fn_booking_status_changed();

-- ──────────────────────────────────────────────
-- MARKETPLACE POSTS — post claimed
-- ──────────────────────────────────────────────

create or replace function public.trg_fn_marketplace_claimed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimer_name text;
  prov_user_id uuid;
begin
  if new.status = old.status or new.status != 'claimed' then
    return new;
  end if;

  select p.full_name into claimer_name
  from public.profiles p
  where p.id = new.claimed_by_user_id;

  -- Notify tenant staff responsible for staffing / marketplace work.
  perform public.notify_tenant_roles(
    new.tenant_id,
    array['admin', 'facility_manager', 'credentialing'],
    'marketplace_claimed',
    'Marketplace post claimed',
    coalesce(claimer_name, 'A provider') || ' has claimed your post: "' || new.title || '"',
    '/dashboard',
    jsonb_build_object('post_id', new.id, 'claimed_by', new.claimed_by_user_id),
    new.claimed_by_user_id
  );

  -- If the post was created by a specific provider, notify that provider too
  if new.provider_id is not null then
    select pp.user_id into prov_user_id
    from public.provider_profiles pp
    where pp.id = new.provider_id;

    if prov_user_id is not null
       and (new.claimed_by_user_id is null or prov_user_id != new.claimed_by_user_id) then
      perform public.insert_notification(
        prov_user_id,
        new.tenant_id,
        'marketplace_claimed',
        'Your offer has been claimed',
        'Your marketplace offer "' || new.title || '" has been claimed',
        '/dashboard',
        jsonb_build_object('post_id', new.id)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_marketplace_claimed on public.marketplace_posts;

create trigger trg_marketplace_claimed
after update on public.marketplace_posts
for each row execute function public.trg_fn_marketplace_claimed();

-- ──────────────────────────────────────────────
-- PROVIDER CREDENTIALS — new credential uploaded
-- ──────────────────────────────────────────────

create or replace function public.trg_fn_credential_uploaded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_name text;
begin
  select pp.display_name into provider_name
  from public.provider_profiles pp
  where pp.id = new.provider_id;

  perform public.notify_tenant_admins(
    new.tenant_id,
    'credential_pending_review',
    'New credential awaiting review',
    coalesce(provider_name, 'A provider') || ' uploaded "' || new.document_name ||
      '" (' || new.credential_type || ')',
    '/credentials',
    jsonb_build_object('credential_id', new.id, 'provider_id', new.provider_id),
    new.uploaded_by
  );

  return new;
end;
$$;

drop trigger if exists trg_credential_uploaded on public.provider_credentials;

create trigger trg_credential_uploaded
after insert on public.provider_credentials
for each row execute function public.trg_fn_credential_uploaded();

-- ──────────────────────────────────────────────
-- CREDENTIAL STATUS HISTORY — credential reviewed
-- ──────────────────────────────────────────────

create or replace function public.trg_fn_credential_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_user_id uuid;
  cred_name        text;
  cred_tenant_id   uuid;
  status_label     text;
begin
  if new.new_status not in ('approved', 'denied') then
    return new;
  end if;

  select c.document_name, c.tenant_id, pp.user_id
    into cred_name, cred_tenant_id, provider_user_id
  from public.provider_credentials c
  join public.provider_profiles pp on pp.id = c.provider_id
  where c.id = new.credential_id;

  status_label := case new.new_status when 'approved' then 'approved' else 'denied' end;

  if provider_user_id is not null then
    perform public.insert_notification(
      provider_user_id,
      cred_tenant_id,
      'credential_reviewed',
      'Credential ' || status_label,
      'Your document "' || coalesce(cred_name, 'credential') || '" has been ' || status_label ||
        case when new.notes is not null and new.notes != '' then ': ' || new.notes else '' end,
      '/credentials',
      jsonb_build_object('credential_id', new.credential_id, 'status', new.new_status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_credential_reviewed on public.credential_status_history;

create trigger trg_credential_reviewed
after insert on public.credential_status_history
for each row execute function public.trg_fn_credential_reviewed();

-- ──────────────────────────────────────────────
-- TENANT INVITES — invite accepted
-- ──────────────────────────────────────────────

create or replace function public.trg_fn_invite_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  accepter_name text;
  tenant_name   text;
begin
  if new.status = old.status or new.status != 'accepted' then
    return new;
  end if;

  select p.full_name into accepter_name
  from public.profiles p
  where lower(p.email::text) = lower(new.email::text)
  limit 1;

  select t.name into tenant_name
  from public.tenants t
  where t.id = new.tenant_id;

  perform public.insert_notification(
    new.invited_by,
    new.tenant_id,
    'invite_accepted',
    'Invite accepted',
    coalesce(accepter_name, new.email::text) || ' has accepted your invitation to join ' ||
      coalesce(tenant_name, 'your workspace'),
    '/settings/team',
    jsonb_build_object('invite_id', new.id, 'email', new.email)
  );

  return new;
end;
$$;

drop trigger if exists trg_invite_accepted on public.tenant_invites;

create trigger trg_invite_accepted
after update on public.tenant_invites
for each row execute function public.trg_fn_invite_accepted();

-- ──────────────────────────────────────────────
-- TENANT MEMBERSHIPS — new member joined
-- ──────────────────────────────────────────────

create or replace function public.trg_fn_member_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_name text;
  tenant_name text;
  role_label  text;
begin
  select p.full_name into member_name
  from public.profiles p
  where p.id = new.user_id;

  select t.name into tenant_name
  from public.tenants t
  where t.id = new.tenant_id;

  role_label := replace(new.role::text, '_', ' ');

  perform public.notify_tenant_admins(
    new.tenant_id,
    'team_member_joined',
    'New team member',
    coalesce(member_name, 'A new member') || ' has joined ' ||
      coalesce(tenant_name, 'your workspace') || ' as ' || role_label,
    '/settings/team',
    jsonb_build_object('user_id', new.user_id, 'role', new.role),
    new.user_id
  );

  return new;
end;
$$;

drop trigger if exists trg_member_joined on public.tenant_memberships;

create trigger trg_member_joined
after insert on public.tenant_memberships
for each row execute function public.trg_fn_member_joined();

-- ──────────────────────────────────────────────
-- INSURANCE CLAIMS — submitted / status changed
-- ──────────────────────────────────────────────

create or replace function public.trg_fn_claim_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payer_name     text;
  submitter_name text;
begin
  select ip.payer_name into payer_name
  from public.insurance_payers ip
  where ip.id = new.payer_id;

  select p.full_name into submitter_name
  from public.profiles p
  where p.id = new.submitted_by;

  perform public.notify_tenant_roles(
    new.tenant_id,
    array['admin', 'billing'],
    'billing_claim_submitted',
    'Claim submitted',
    coalesce(submitter_name, 'A team member') || ' submitted a claim to ' ||
      coalesce(payer_name, 'an insurance payer') || ' for $' || trim(to_char(new.billed_amount, 'FM999999990.00')),
    '/billing',
    jsonb_build_object('claim_id', new.id, 'status', new.status, 'payer_id', new.payer_id),
    new.submitted_by
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.insurance_claims') is not null then
    execute 'drop trigger if exists trg_claim_submitted on public.insurance_claims';
    execute 'create trigger trg_claim_submitted
      after insert on public.insurance_claims
      for each row execute function public.trg_fn_claim_submitted()';
  end if;
end;
$$;

create or replace function public.trg_fn_claim_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payer_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  select ip.payer_name into payer_name
  from public.insurance_payers ip
  where ip.id = new.payer_id;

  perform public.notify_tenant_roles(
    new.tenant_id,
    array['admin', 'billing'],
    'billing_claim_status_changed',
    'Claim ' || new.status,
    'A claim with ' || coalesce(payer_name, 'an insurance payer') || ' is now ' || new.status,
    '/billing',
    jsonb_build_object('claim_id', new.id, 'status', new.status, 'payer_id', new.payer_id)
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.insurance_claims') is not null then
    execute 'drop trigger if exists trg_claim_status_changed on public.insurance_claims';
    execute 'create trigger trg_claim_status_changed
      after update on public.insurance_claims
      for each row execute function public.trg_fn_claim_status_changed()';
  end if;
end;
$$;
