-- ============================================================
-- Message Attachments
--
-- Adds optional file attachments for direct message threads.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

alter table public.message_thread_messages
  add column if not exists attachment_name text,
  add column if not exists attachment_path text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size_bytes bigint;

drop policy if exists message_attachments_upload on storage.objects;
create policy message_attachments_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists message_attachments_read on storage.objects;
create policy message_attachments_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1
      from public.message_thread_messages m
      join public.message_conversation_participants cp
        on cp.conversation_id = m.conversation_id
       and cp.user_id = auth.uid()
      where m.attachment_path = storage.objects.name
    )
  );

drop policy if exists message_attachments_delete on storage.objects;
create policy message_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1
      from public.message_thread_messages m
      where m.attachment_path = storage.objects.name
        and m.sender_id = auth.uid()
    )
  );

drop function if exists public.send_direct_message(uuid, text, text, text, text, bigint);

create or replace function public.send_direct_message(
  target_user_id uuid,
  body text,
  attachment_storage_path text default null,
  attachment_name text default null,
  attachment_mime_type text default null,
  attachment_size_bytes bigint default null
)
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

  insert into public.message_thread_messages (
    conversation_id,
    sender_id,
    body,
    attachment_name,
    attachment_path,
    attachment_mime_type,
    attachment_size_bytes
  )
  values (
    conversation_row_id,
    caller_id,
    trim(body),
    attachment_name,
    attachment_storage_path,
    attachment_mime_type,
    attachment_size_bytes
  )
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

grant execute on function public.send_direct_message(uuid, text, text, text, text, bigint) to authenticated;
