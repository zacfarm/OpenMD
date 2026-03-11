-- Provider Credentials & Document Management
-- Allows providers to upload credential documents. Facility admins/credentialing
-- staff can review and approve/deny with a full status-change history.

-- ─── Storage bucket ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('credentials', 'credentials', false)
on conflict (id) do nothing;

-- Only authenticated users may read objects they own or that belong to their tenant.
create policy "credentials_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'credentials' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "credentials_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'credentials' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "credentials_delete_owner" on storage.objects
  for delete to authenticated
  using (bucket_id = 'credentials' and auth.uid()::text = (storage.foldername(name))[1]);

-- ─── credential_type enum ─────────────────────────────────────────────────────
create type public.credential_status as enum (
  'pending',
  'approved',
  'denied',
  'expired'
);

-- ─── provider_credentials table ───────────────────────────────────────────────
create table public.provider_credentials (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references public.provider_profiles(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  uploaded_by     uuid not null references auth.users(id) on delete cascade,
  credential_type text not null,                        -- e.g. "DEA License", "Board Cert"
  document_name   text not null,
  storage_path    text not null,                        -- path inside the 'credentials' bucket
  status          public.credential_status not null default 'pending',
  notes           text,
  expires_on      date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_credentials_provider  on public.provider_credentials (provider_id);
create index idx_credentials_tenant    on public.provider_credentials (tenant_id);
create index idx_credentials_status    on public.provider_credentials (status);

create trigger trg_credentials_updated_at
  before update on public.provider_credentials
  for each row execute function public.set_updated_at();

-- ─── credential_status_history table ─────────────────────────────────────────
-- Full audit trail: every status change is recorded here.
create table public.credential_status_history (
  id              uuid primary key default gen_random_uuid(),
  credential_id   uuid not null references public.provider_credentials(id) on delete cascade,
  old_status      public.credential_status,
  new_status      public.credential_status not null,
  changed_by      uuid not null references auth.users(id) on delete cascade,
  notes           text,
  created_at      timestamptz not null default now()
);

create index idx_cred_history_credential on public.credential_status_history (credential_id, created_at desc);

-- ─── Trigger: auto-record history on status change ───────────────────────────
create or replace function public.record_credential_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into public.credential_status_history
      (credential_id, old_status, new_status, changed_by)
    values
      (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_credential_status_history
  after update on public.provider_credentials
  for each row execute function public.record_credential_status_change();

-- ─── RPC: review_credential (approve / deny) ─────────────────────────────────
create or replace function public.review_credential(
  p_credential_id uuid,
  p_status        public.credential_status,
  p_notes         text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_caller_role public.tenant_role;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select tenant_id into v_tenant_id
  from public.provider_credentials
  where id = p_credential_id;

  if v_tenant_id is null then
    raise exception 'Credential not found';
  end if;

  v_caller_role := public.current_tenant_role(v_tenant_id);

  if v_caller_role not in ('admin', 'facility_manager', 'credentialing') then
    raise exception 'Only admins, facility managers, and credentialing staff can review credentials';
  end if;

  update public.provider_credentials
  set status = p_status,
      notes  = coalesce(p_notes, notes)
  where id = p_credential_id;
end;
$$;

grant execute on function public.review_credential(uuid, public.credential_status, text) to authenticated;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.provider_credentials        enable row level security;
alter table public.credential_status_history   enable row level security;

-- provider_credentials: provider sees own docs; credentialing/admin see all in tenant
create policy "credentials_select" on public.provider_credentials
  for select to authenticated using (
    uploaded_by = auth.uid()
    or public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  );

create policy "credentials_insert" on public.provider_credentials
  for insert to authenticated with check (
    uploaded_by = auth.uid()
  );

create policy "credentials_update_reviewer" on public.provider_credentials
  for update to authenticated using (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  ) with check (
    public.current_tenant_role(tenant_id) in ('admin', 'facility_manager', 'credentialing')
  );

-- history: same visibility as the parent credential
create policy "cred_history_select" on public.credential_status_history
  for select to authenticated using (
    exists (
      select 1 from public.provider_credentials pc
      where pc.id = credential_id
        and (
          pc.uploaded_by = auth.uid()
          or public.current_tenant_role(pc.tenant_id) in ('admin', 'facility_manager', 'credentialing')
        )
    )
  );
