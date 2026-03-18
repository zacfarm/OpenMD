-- ============================================================
-- Notification Preferences
-- Per-user control over which event types trigger in-app
-- and email notifications.
-- ============================================================

create table public.notification_preferences (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  event_type text        not null,
  in_app     boolean     not null default true,
  email      boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_type)
);

create trigger trg_notif_prefs_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

create policy notif_prefs_select on public.notification_preferences
  for select using (user_id = auth.uid());

create policy notif_prefs_insert on public.notification_preferences
  for insert with check (user_id = auth.uid());

create policy notif_prefs_update on public.notification_preferences
  for update using (user_id = auth.uid());

create policy notif_prefs_delete on public.notification_preferences
  for delete using (user_id = auth.uid());

-- ──────────────────────────────────────────────
-- Helper: fetch notifications pending email delivery
-- Called by the /api/cron/send-notification-emails route
-- Returns unread notifications created since `since_time`
-- for users who opted into email delivery for that event_type.
-- ──────────────────────────────────────────────

create or replace function public.get_pending_email_notifications(since_time timestamptz)
returns table (
  notification_id uuid,
  user_email      text,
  user_name       text,
  title           text,
  body            text,
  action_url      text,
  notif_type      text
)
language sql
security definer
set search_path = public
as $$
  select
    n.id,
    p.email::text,
    p.full_name,
    n.title,
    n.body,
    n.action_url,
    n.type
  from public.notifications n
  join public.profiles p on p.id = n.user_id
  where n.status = 'unread'
    and n.created_at >= since_time
    and exists (
      select 1
      from public.notification_preferences np
      where np.user_id = n.user_id
        and np.event_type = n.type
        and np.email = true
    );
$$;
