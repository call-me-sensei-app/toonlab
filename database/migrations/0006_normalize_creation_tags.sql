create or replace function toonlab_normalize_creation_tags(input_tags text[])
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(slug order by first_ordinal), '{}'::text[])
  from (
    select slug, min(ordinality) as first_ordinal
    from (
      select
        trim(both '-' from left(
          regexp_replace(lower(trim(raw_tag)), '[^a-z0-9]+', '-', 'g'),
          32
        )) as slug,
        ordinality
      from unnest(coalesce(input_tags, '{}'::text[])) with ordinality as source(raw_tag, ordinality)
    ) normalized
    where slug <> ''
    group by slug
    order by min(ordinality)
    limit 10
  ) deduplicated;
$$;

update creations
set tags = toonlab_normalize_creation_tags(tags)
where tags is distinct from toonlab_normalize_creation_tags(tags);
