-- Adds a payment posting table for insurance claims.

create table if not exists public.insurance_claim_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  claim_id uuid not null references public.insurance_claims(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default now(),
  check_number text,
  posted_by uuid not null references auth.users(id) on delete cascade,
  posted_at timestamptz not null default now()
);

create index if not exists idx_insurance_claim_payments_claim_id
  on public.insurance_claim_payments (claim_id, posted_at desc);

alter table public.insurance_claim_payments enable row level security;

create policy "insurance_claim_payments_select_billing_roles" on public.insurance_claim_payments
  for select to authenticated using (
    public.current_tenant_role(tenant_id) in ('admin', 'billing', 'facility_manager', 'credentialing')
  );

create policy "insurance_claim_payments_insert_billing_roles" on public.insurance_claim_payments
  for insert to authenticated with check (
    posted_by = auth.uid()
    and public.current_tenant_role(tenant_id) in ('admin', 'billing')
  );
