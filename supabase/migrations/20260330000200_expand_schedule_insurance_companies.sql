alter table public.tenant_schedule_insurance_companies
  add column if not exists address_line_1 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text,
  add column if not exists network_status text check (network_status in ('in_network', 'out_of_network'));
