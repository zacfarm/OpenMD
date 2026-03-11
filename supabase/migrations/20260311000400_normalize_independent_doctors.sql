update public.tenants
set org_type = 'practice'
where org_type = 'independent_doctor';

update public.directory_entities de
set
  entity_type = 'practice',
  provider_id = null,
  parent_entity_id = null,
  description = coalesce(nullif(de.description, ''), 'Practice profile on OpenMD')
from public.tenants t
where de.tenant_id = t.id
  and t.org_type = 'practice'
  and de.parent_entity_id is null
  and de.entity_type = 'doctor';

create or replace function public.bootstrap_tenant(
  org_name text,
  org_kind public.org_type,
  full_name_input text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
  base_slug text;
  normalized_org_kind public.org_type;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  normalized_org_kind := case
    when org_kind = 'independent_doctor' then 'practice'::public.org_type
    else org_kind
  end;

  update public.profiles
  set full_name = coalesce(nullif(trim(full_name_input), ''), full_name)
  where id = auth.uid();

  insert into public.tenants (name, org_type, owner_user_id)
  values (trim(org_name), normalized_org_kind, auth.uid())
  returning id into new_tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role)
  values (new_tenant_id, auth.uid(), 'admin')
  on conflict (tenant_id, user_id) do nothing;

  base_slug := public.slugify(org_name) || '-' || substr(new_tenant_id::text, 1, 8);

  if normalized_org_kind = 'facility' then
    insert into public.directory_entities (
      entity_type,
      tenant_id,
      slug,
      name,
      location,
      description
    ) values (
      'facility',
      new_tenant_id,
      base_slug,
      org_name,
      null,
      'Facility profile on OpenMD'
    );
  else
    insert into public.directory_entities (
      entity_type,
      tenant_id,
      slug,
      name,
      location,
      description
    ) values (
      'practice',
      new_tenant_id,
      base_slug,
      org_name,
      null,
      'Practice profile on OpenMD'
    );
  end if;

  return new_tenant_id;
end;
$$;
