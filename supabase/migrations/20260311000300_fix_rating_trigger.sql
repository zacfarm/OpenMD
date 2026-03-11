create or replace function public.recalculate_entity_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_entity_id uuid;
begin
  target_entity_id := coalesce(new.entity_id, old.entity_id);

  update public.directory_entities de
  set
    average_rating = coalesce((
      select round(avg(dr.star_rating)::numeric, 2)
      from public.directory_reviews dr
      where dr.entity_id = target_entity_id
    ), 0),
    rating_count = (
      select count(*)
      from public.directory_reviews dr
      where dr.entity_id = target_entity_id
    )
  where de.id = target_entity_id;

  return null;
end;
$$;

drop trigger if exists trg_recalculate_entity_rating on public.directory_reviews;

create trigger trg_recalculate_entity_rating
after insert or update or delete on public.directory_reviews
for each row execute function public.recalculate_entity_rating();

update public.directory_entities de
set
  average_rating = coalesce(stats.average_rating, 0),
  rating_count = coalesce(stats.rating_count, 0)
from (
  select
    dr.entity_id,
    round(avg(dr.star_rating)::numeric, 2) as average_rating,
    count(*)::int as rating_count
  from public.directory_reviews dr
  group by dr.entity_id
) stats
where de.id = stats.entity_id;

update public.directory_entities de
set
  average_rating = 0,
  rating_count = 0
where not exists (
  select 1
  from public.directory_reviews dr
  where dr.entity_id = de.id
);
