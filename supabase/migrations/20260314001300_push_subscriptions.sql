-- ============================================================
-- Push Subscriptions + Credential Expiry Function
-- ============================================================

-- ──────────────────────────────────────────────
-- Push subscriptions (Web Push API)
-- ──────────────────────────────────────────────

create table public.push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  endpoint   text        not null,
  p256dh     text        not null,
  auth_key   text        not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy push_sub_select on public.push_subscriptions
  for select using (user_id = auth.uid());

create policy push_sub_insert on public.push_subscriptions
  for insert with check (user_id = auth.uid());

create policy push_sub_upsert on public.push_subscriptions
  for update using (user_id = auth.uid());

create policy push_sub_delete on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- ──────────────────────────────────────────────
-- Credential expiry notifications
-- Called daily by /api/cron/credential-expiry
-- Notifies providers whose approved credentials expire in 30 or 7 days,
-- but only sends once per credential/threshold per day.
-- ──────────────────────────────────────────────

create or replace function public.notify_expiring_credentials()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r            record;
  already_sent boolean;
  sent_count   integer := 0;
begin
  for r in
    select
      c.id              as cred_id,
      c.document_name,
      c.credential_type,
      c.tenant_id,
      c.expires_on,
      pp.user_id        as provider_user_id,
      (c.expires_on - current_date)::integer as days_left
    from public.provider_credentials c
    join public.provider_profiles pp on pp.id = c.provider_id
    where c.status = 'approved'
      and c.expires_on is not null
      and pp.user_id is not null
      and (c.expires_on - current_date)::integer in (30, 7)
  loop
    -- Deduplicate: skip if we already sent this notification today for this threshold
    select exists(
      select 1
      from public.notifications n
      where n.user_id = r.provider_user_id
        and n.type = 'credential_expiring'
        and (n.metadata ->> 'credential_id') = r.cred_id::text
        and (n.metadata ->> 'days_left')::integer = r.days_left
        and date(n.created_at at time zone 'UTC') = current_date
    ) into already_sent;

    if not already_sent then
      insert into public.notifications
        (user_id, tenant_id, type, title, body, action_url, metadata)
      values (
        r.provider_user_id,
        r.tenant_id,
        'credential_expiring',
        'Credential expiring in ' || r.days_left || ' days',
        '"' || r.document_name || '" (' || r.credential_type || ') expires on ' ||
          to_char(r.expires_on, 'Mon DD, YYYY'),
        '/credentials',
        jsonb_build_object(
          'credential_id', r.cred_id,
          'days_left',     r.days_left,
          'expires_on',    r.expires_on::text
        )
      );
      sent_count := sent_count + 1;
    end if;
  end loop;

  return sent_count;
end;
$$;

-- Helper: fetch push subscriptions for users with recent unread notifications
-- Called by the /api/cron/send-push-notifications route
create or replace function public.get_pending_push_notifications(since_time timestamptz)
returns table (
  notification_id uuid,
  endpoint        text,
  p256dh          text,
  auth_key        text,
  title           text,
  body            text,
  action_url      text
)
language sql
security definer
set search_path = public
as $$
  select distinct on (ps.endpoint)
    n.id,
    ps.endpoint,
    ps.p256dh,
    ps.auth_key,
    n.title,
    n.body,
    n.action_url
  from public.notifications n
  join public.push_subscriptions ps on ps.user_id = n.user_id
  where n.status = 'unread'
    and n.created_at >= since_time
  order by ps.endpoint, n.created_at desc;
$$;
