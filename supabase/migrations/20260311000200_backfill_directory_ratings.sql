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
