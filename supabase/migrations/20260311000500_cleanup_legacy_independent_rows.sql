delete from public.directory_entities de
where de.parent_entity_id is null
  and de.entity_type = 'practice'
  and coalesce(trim(de.name), '') = ''
  and de.description = 'Independent practice profile on OpenMD'
  and de.rating_count = 0
  and not exists (
    select 1
    from public.directory_reviews dr
    where dr.entity_id = de.id
  );

update public.directory_entities
set
  name = 'Independent Practice',
  slug = 'independent-practice-' || substr(id::text, 1, 8)
where parent_entity_id is null
  and entity_type = 'practice'
  and coalesce(trim(name), '') = '';
