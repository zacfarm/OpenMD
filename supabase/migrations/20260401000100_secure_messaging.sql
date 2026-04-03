-- ============================================================
-- Secure Direct Messaging
--
-- Adds user-to-user 1:1 messaging with RLS-scoped conversations,
-- participant read state, contact search, and thread summaries.
-- ============================================================

create table if not exists public.message_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_key text not null unique,
  conversation_type text not null default 'direct' check (conversation_type = 'direct'),
  created_by uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.message_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create table if not exists public.message_thread_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.message_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  check (char_length(trim(body)) between 1 and 4000)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_conversation_participants'
      and column_name = 'thread_conversation_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_conversation_participants'
      and column_name = 'conversation_id'
  ) then
    execute 'alter table public.message_conversation_participants rename column thread_conversation_id to conversation_id';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_thread_messages'
      and column_name = 'thread_conversation_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_thread_messages'
      and column_name = 'conversation_id'
  ) then
    execute 'alter table public.message_thread_messages rename column thread_conversation_id to conversation_id';
  end if;
end;
$$;

create index if not exists idx_message_conversations_last_message on public.message_conversations (last_message_at desc);
create index if not exists idx_message_participants_user on public.message_conversation_participants (user_id, conversation_id);
create index if not exists idx_message_participants_conversation on public.message_conversation_participants (conversation_id, user_id);
create index if not exists idx_message_thread_messages_conversation_created on public.message_thread_messages (conversation_id, created_at asc);

drop trigger if exists trg_message_conversations_updated_at on public.message_conversations;
create trigger trg_message_conversations_updated_at
before update on public.message_conversations
for each row execute function public.set_updated_at();

create or replace function public.touch_message_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message_conversations
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists trg_message_thread_messages_touch_conversation on public.message_thread_messages;
create trigger trg_message_thread_messages_touch_conversation
after insert on public.message_thread_messages
for each row execute function public.touch_message_conversation();

drop function if exists public.messaging_contacts(text);
drop function if exists public.messaging_contacts(text, uuid, text, text);

create or replace function public.messaging_contacts(
  p_search text default null,
  p_tenant_id uuid default null,
  p_role text default null,
  p_kind text default null
)
returns table (
  user_id uuid,
  display_name text,
  email text,
  user_kind text,
  tenant_id uuid,
  tenant_name text,
  tenant_role text,
  recipient_group text
)
language sql
stable
security definer
set search_path = public
as $$
  with provider_contacts as (
    select distinct on (p.id)
      p.id as user_id,
      coalesce(
        nullif(trim(pp.display_name), ''),
        nullif(trim(p.full_name), ''),
        split_part(coalesce(p.email::text, 'OpenMD User'), '@', 1)
      ) as display_name,
      p.email::text as email,
      'provider'::text as user_kind,
      pp.practice_tenant_id as tenant_id,
      pt.name as tenant_name,
      null::text as tenant_role,
      'Providers'::text as recipient_group
    from public.provider_profiles pp
    join public.profiles p on p.id = pp.user_id
    left join public.tenants pt on pt.id = pp.practice_tenant_id
    where p.id <> auth.uid()
      and (
        p_search is null
        or trim(p_search) = ''
        or coalesce(pp.display_name, p.full_name, p.email::text) ilike '%' || trim(p_search) || '%'
        or p.email::text ilike '%' || trim(p_search) || '%'
      )
  ),
  facility_contacts as (
    select distinct on (p.id, tm.tenant_id)
      p.id as user_id,
      coalesce(
        nullif(trim(pp.display_name), ''),
        nullif(trim(p.full_name), ''),
        split_part(coalesce(p.email::text, 'OpenMD User'), '@', 1)
      ) as display_name,
      p.email::text as email,
      'facility'::text as user_kind,
      tm.tenant_id,
      t.name as tenant_name,
      tm.role::text as tenant_role,
      'Facilities'::text as recipient_group
    from public.tenant_memberships tm
    join public.tenants t on t.id = tm.tenant_id and t.org_type = 'facility'
    join public.profiles p on p.id = tm.user_id
    left join public.provider_profiles pp on pp.user_id = p.id
    where p.id <> auth.uid()
      and tm.role in ('admin', 'facility_manager')
      and (
        p_search is null
        or trim(p_search) = ''
        or coalesce(pp.display_name, p.full_name, p.email::text, t.name) ilike '%' || trim(p_search) || '%'
        or p.email::text ilike '%' || trim(p_search) || '%'
        or t.name ilike '%' || trim(p_search) || '%'
      )
  ),
  billing_contacts as (
    select distinct on (p.id, tm.tenant_id)
      p.id as user_id,
      coalesce(
        nullif(trim(pp.display_name), ''),
        nullif(trim(p.full_name), ''),
        split_part(coalesce(p.email::text, 'OpenMD User'), '@', 1)
      ) as display_name,
      p.email::text as email,
      'billing'::text as user_kind,
      tm.tenant_id,
      t.name as tenant_name,
      tm.role::text as tenant_role,
      'Billing'::text as recipient_group
    from public.tenant_memberships tm
    join public.tenants t on t.id = tm.tenant_id
    join public.profiles p on p.id = tm.user_id
    left join public.provider_profiles pp on pp.user_id = p.id
    where p.id <> auth.uid()
      and tm.role = 'billing'
      and (
        p_search is null
        or trim(p_search) = ''
        or coalesce(pp.display_name, p.full_name, p.email::text, t.name) ilike '%' || trim(p_search) || '%'
        or p.email::text ilike '%' || trim(p_search) || '%'
        or t.name ilike '%' || trim(p_search) || '%'
      )
  ),
  scheduler_contacts as (
    select distinct on (p.id, tm.tenant_id)
      p.id as user_id,
      coalesce(
        nullif(trim(pp.display_name), ''),
        nullif(trim(p.full_name), ''),
        split_part(coalesce(p.email::text, 'OpenMD User'), '@', 1)
      ) as display_name,
      p.email::text as email,
      'scheduler'::text as user_kind,
      tm.tenant_id,
      t.name as tenant_name,
      tm.role::text as tenant_role,
      'Schedulers'::text as recipient_group
    from public.tenant_memberships tm
    join public.tenants t on t.id = tm.tenant_id
    join public.profiles p on p.id = tm.user_id
    left join public.provider_profiles pp on pp.user_id = p.id
    where p.id <> auth.uid()
      and tm.role = 'credentialing'
      and (
        p_search is null
        or trim(p_search) = ''
        or coalesce(pp.display_name, p.full_name, p.email::text, t.name) ilike '%' || trim(p_search) || '%'
        or p.email::text ilike '%' || trim(p_search) || '%'
        or t.name ilike '%' || trim(p_search) || '%'
      )
  ),
  recipients as (
    select * from provider_contacts
    union all
    select * from facility_contacts
    union all
    select * from billing_contacts
    union all
    select * from scheduler_contacts
  )
  select
    r.user_id,
    r.display_name,
    r.email,
    r.user_kind,
    r.tenant_id,
    r.tenant_name,
    r.tenant_role,
    r.recipient_group
  from recipients r
  where (
    p_kind is null
    or trim(p_kind) = ''
    or r.user_kind = p_kind
  )
  order by r.recipient_group, r.display_name, r.email
  limit 100;
$$;

drop function if exists public.send_direct_message(uuid, text);

create or replace function public.send_direct_message(target_user_id uuid, body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  sender_name text;
  recipient_name text;
  direct_key text;
  conversation_row_id uuid;
  message_row_id uuid;
begin
  if caller_id is null then
    raise exception 'Must be signed in';
  end if;

  if target_user_id is null then
    raise exception 'Recipient is required';
  end if;

  if target_user_id = caller_id then
    raise exception 'You cannot message yourself';
  end if;

  if body is null or char_length(trim(body)) = 0 then
    raise exception 'Message body is required';
  end if;

  if char_length(trim(body)) > 4000 then
    raise exception 'Message body is too long';
  end if;

  select coalesce(nullif(trim(pp.display_name), ''), nullif(trim(p.full_name), ''), split_part(coalesce(p.email::text, 'OpenMD User'), '@', 1))
    into sender_name
  from public.profiles p
  left join public.provider_profiles pp on pp.user_id = p.id
  where p.id = caller_id;

  select coalesce(nullif(trim(pp.display_name), ''), nullif(trim(p.full_name), ''), split_part(coalesce(p.email::text, 'OpenMD User'), '@', 1))
    into recipient_name
  from public.profiles p
  left join public.provider_profiles pp on pp.user_id = p.id
  where p.id = target_user_id;

  direct_key := case
    when caller_id::text < target_user_id::text then caller_id::text || ':' || target_user_id::text
    else target_user_id::text || ':' || caller_id::text
  end;

  insert into public.message_conversations (conversation_key, conversation_type, created_by)
  values (direct_key, 'direct', caller_id)
  on conflict (conversation_key)
  do update set updated_at = now()
  returning id into conversation_row_id;

  insert into public.message_conversation_participants (conversation_id, user_id, last_read_at)
  values (conversation_row_id, caller_id, now())
  on conflict (conversation_id, user_id)
  do update set last_read_at = excluded.last_read_at;

  insert into public.message_conversation_participants (conversation_id, user_id)
  values (conversation_row_id, target_user_id)
  on conflict (conversation_id, user_id)
  do nothing;

  insert into public.message_thread_messages (conversation_id, sender_id, body)
  values (conversation_row_id, caller_id, trim(body))
  returning id into message_row_id;

  insert into public.notifications (
    user_id,
    tenant_id,
    type,
    title,
    body,
    action_url,
    metadata
  )
  values (
    target_user_id,
    null,
    'message_received',
    'New message from ' || coalesce(sender_name, 'OpenMD User'),
    left(coalesce(sender_name, 'OpenMD User') || ': ' || trim(body), 220),
    '/messages?conversation=' || conversation_row_id::text,
    jsonb_build_object(
      'conversation_id', conversation_row_id,
      'sender_id', caller_id,
      'sender_name', sender_name,
      'recipient_id', target_user_id,
      'recipient_name', recipient_name,
      'audience', 'recipient',
      'notification_kind', 'direct_message'
    )
  );

  return jsonb_build_object(
    'conversation_id', conversation_row_id,
    'message_id', message_row_id
  );
end;
$$;

create or replace function public.message_threads()
returns table (
  conversation_id uuid,
  partner_user_id uuid,
  partner_name text,
  partner_email text,
  last_message_body text,
  last_message_at timestamptz,
  unread_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as conversation_id,
    partner.user_id as partner_user_id,
    partner.partner_name,
    partner.partner_email,
    last_message.body as last_message_body,
    c.last_message_at,
    coalesce(unread.unread_count, 0)::integer as unread_count
  from public.message_conversations c
  join public.message_conversation_participants me
    on me.conversation_id = c.id
   and me.user_id = auth.uid()
  join lateral (
    select
      cp.user_id,
      coalesce(
        nullif(trim(pp.display_name), ''),
        nullif(trim(pr.full_name), ''),
        split_part(coalesce(pr.email::text, 'OpenMD User'), '@', 1)
      ) as partner_name,
      pr.email::text as partner_email
    from public.message_conversation_participants cp
    left join public.profiles pr on pr.id = cp.user_id
    left join public.provider_profiles pp on pp.user_id = cp.user_id
    where cp.conversation_id = c.id
      and cp.user_id <> auth.uid()
    order by cp.created_at asc
    limit 1
  ) partner on true
  left join lateral (
    select m.body
    from public.message_thread_messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last_message on true
  left join lateral (
    select count(*)::integer as unread_count
    from public.message_thread_messages m
    where m.conversation_id = c.id
      and m.sender_id <> auth.uid()
      and m.created_at > coalesce(me.last_read_at, timestamp 'epoch')
  ) unread on true
  order by c.last_message_at desc, c.created_at desc;
$$;

create or replace function public.unread_message_threads_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.message_conversations c
  join public.message_conversation_participants me
    on me.conversation_id = c.id
   and me.user_id = auth.uid()
  where exists (
    select 1
    from public.message_thread_messages m
    where m.conversation_id = c.id
      and m.sender_id <> auth.uid()
      and m.created_at > coalesce(me.last_read_at, timestamp 'epoch')
  );
$$;

alter table public.message_conversations enable row level security;
alter table public.message_conversation_participants enable row level security;
alter table public.message_thread_messages enable row level security;

drop policy if exists "message_conversations_select_participant" on public.message_conversations;
create policy "message_conversations_select_participant" on public.message_conversations
  for select using (
    exists (
      select 1
      from public.message_conversation_participants cp
      where cp.conversation_id = id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "message_conversations_insert_creator" on public.message_conversations;
create policy "message_conversations_insert_creator" on public.message_conversations
  for insert with check (created_by = auth.uid());

drop policy if exists "message_conversations_update_participant" on public.message_conversations;
create policy "message_conversations_update_participant" on public.message_conversations
  for update using (
    exists (
      select 1
      from public.message_conversation_participants cp
      where cp.conversation_id = id
        and cp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.message_conversation_participants cp
      where cp.conversation_id = id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "message_participants_select_own" on public.message_conversation_participants;
create policy "message_participants_select_own" on public.message_conversation_participants
  for select using (user_id = auth.uid());

drop policy if exists "message_participants_update_own" on public.message_conversation_participants;
create policy "message_participants_update_own" on public.message_conversation_participants
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "message_thread_messages_select_participant" on public.message_thread_messages;
create policy "message_thread_messages_select_participant" on public.message_thread_messages
  for select using (
    exists (
      select 1
      from public.message_conversation_participants cp
      where cp.conversation_id = conversation_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "message_thread_messages_insert_sender_participant" on public.message_thread_messages;
create policy "message_thread_messages_insert_sender_participant" on public.message_thread_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.message_conversation_participants cp
      where cp.conversation_id = conversation_id
        and cp.user_id = auth.uid()
    )
  );

grant select, insert, update on public.message_conversations to authenticated;
grant select, insert, update on public.message_conversation_participants to authenticated;
grant select, insert on public.message_thread_messages to authenticated;
grant execute on function public.messaging_contacts(text, uuid, text, text) to authenticated;
grant execute on function public.send_direct_message(uuid, text) to authenticated;
grant execute on function public.message_threads() to authenticated;
grant execute on function public.unread_message_threads_count() to authenticated;