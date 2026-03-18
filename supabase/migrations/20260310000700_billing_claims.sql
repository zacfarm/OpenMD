-- Billing portal support: preconfigured payers and claim submissions.

create table if not exists public.insurance_payers (
  id uuid primary key default gen_random_uuid(),
  payer_name text not null,
  payer_code text not null unique,
  claim_endpoint text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payer_id uuid not null references public.insurance_payers(id) on delete restrict,
  patient_name text not null,
  member_id text not null,
  service_date date not null,
  cpt_code text not null,
  diagnosis_code text not null,
  billed_amount numeric(12,2) not null check (billed_amount > 0),
  notes text,
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'rejected')),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_insurance_claims_tenant_created_at
  on public.insurance_claims (tenant_id, created_at desc);

insert into public.insurance_payers (payer_name, payer_code, claim_endpoint)
values
  ('Aetna', 'AETNA', 'https://claims.aetna.example/submit'),
  ('Blue Cross Blue Shield', 'BCBS', 'https://claims.bcbs.example/submit'),
  ('Cigna', 'CIGNA', 'https://claims.cigna.example/submit'),
  ('Humana', 'HUMANA', 'https://claims.humana.example/submit'),
  ('Medicare', 'MEDICARE', 'https://claims.medicare.example/submit'),
  ('Medicaid', 'MEDICAID', 'https://claims.medicaid.example/submit'),
  ('UnitedHealthcare', 'UHC', 'https://claims.uhc.example/submit')
on conflict (payer_code) do nothing;

alter table public.insurance_payers enable row level security;
alter table public.insurance_claims enable row level security;

drop policy if exists "insurance_payers_select_authenticated" on public.insurance_payers;
drop policy if exists "insurance_claims_select_billing_roles" on public.insurance_claims;
drop policy if exists "insurance_claims_insert_billing_roles" on public.insurance_claims;

create policy "insurance_payers_select_authenticated" on public.insurance_payers
  for select to authenticated using (is_active = true);

create policy "insurance_claims_select_billing_roles" on public.insurance_claims
  for select to authenticated using (
    public.current_tenant_role(tenant_id) in ('admin', 'billing', 'facility_manager', 'credentialing')
  );

create policy "insurance_claims_insert_billing_roles" on public.insurance_claims
  for insert to authenticated with check (
    submitted_by = auth.uid()
    and public.current_tenant_role(tenant_id) in ('admin', 'billing')
  );
