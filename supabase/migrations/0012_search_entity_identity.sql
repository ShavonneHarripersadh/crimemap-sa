-- Phase 1.1. Search must not collapse two geo entities that share a name.
--
-- (entity_type, slug) stays the canonical uniqueness constraint. The same
-- display name is allowed when the slugs differ. entity id is the stable
-- internal identity. station_slug stays the public station URL.
--
-- A police station with no province, municipality or district is still a
-- station entity with its crime records. An unresolved administrative
-- relationship is not unavailable crime data. No within relationship is
-- inferred for those stations.
--
-- dataset_coverage.status = available means that dataset has records for the
-- entity. An entity existing is not coverage. No rows are added here for
-- datasets that have not been loaded.

comment on constraint geo_entities_type_slug_key on geo_entities is
  'Canonical uniqueness. Same names are allowed when slugs differ. entity id is the internal identity; station_slug remains the public station URL.';

comment on table dataset_coverage is
  'Whether a dataset has records for an entity. available means those records are loaded, not that the entity merely exists. Do not insert a row for a dataset that has not been loaded. Absence of a row means the dataset has not been assessed.';

comment on column police_stations.entity_id is
  'Optional link to the police_station geo entity. Crime rows still reference police_stations.id. A station with no province, municipality or district remains a valid station with its crime records. An unresolved administrative relationship is not unavailable crime data, and no within relationship is invented for it.';

comment on table geo_relationships is
  'Many-to-many links between entities. within, served_by and later types are rows, not columns. Missing administrative attributes do not get a guessed within row.';

create or replace function search_locations(q text, max_results integer default 10)
returns table (
  result_type           text,
  label                 text,
  slug                  text,
  station_id            bigint,
  station_count         integer,
  local_municipality    text,
  district_municipality text,
  province_name         text,
  province_slug         text,
  score                 real,
  entity_id             bigint,
  entity_type           text
)
language sql
stable
security invoker
set search_path = public
as $$
  with needle as (
    select nullif(btrim(lower(unaccent(q))), '') as term
  ),
  stations as (
    select
      'station'::text as result_type,
      s.station_name  as label,
      s.station_slug  as slug,
      s.id            as station_id,
      1               as station_count,
      s.local_municipality,
      s.district_municipality,
      s.province_name,
      s.province_slug,
      (case when lower(unaccent(s.station_name)) like n.term || '%' then 1.0 else 0.0 end
        + similarity(lower(unaccent(s.station_name)), n.term))::real as score,
      s.entity_id,
      case when s.entity_id is null then null else 'police_station' end as entity_type
    from police_stations s, needle n
    where n.term is not null
      and (lower(unaccent(s.station_name)) like '%' || n.term || '%'
           or similarity(lower(unaccent(s.station_name)), n.term) > 0.25)
  ),
  locals as (
    select
      'local_municipality'::text as result_type,
      s.local_municipality       as label,
      null::text                 as slug,
      null::bigint               as station_id,
      count(*)::integer          as station_count,
      s.local_municipality,
      min(s.district_municipality) as district_municipality,
      s.province_name,
      s.province_slug,
      max(case when lower(unaccent(s.local_municipality)) like n.term || '%' then 1.0 else 0.0 end
        + similarity(lower(unaccent(s.local_municipality)), n.term))::real as score,
      entity.id as entity_id,
      'local_municipality'::text as entity_type
    from police_stations s
    cross join needle n
    left join geo_entities entity
      on entity.entity_type = 'local_municipality'
     and entity.slug = coalesce(s.province_slug, 'unassigned') || '/' || geo_slug(s.local_municipality)
    where n.term is not null
      and s.local_municipality is not null
      and (lower(unaccent(s.local_municipality)) like '%' || n.term || '%'
           or similarity(lower(unaccent(s.local_municipality)), n.term) > 0.3)
    group by entity.id, s.local_municipality, s.province_name, s.province_slug
  ),
  districts as (
    select
      'district_municipality'::text as result_type,
      s.district_municipality       as label,
      null::text                    as slug,
      null::bigint                  as station_id,
      count(*)::integer             as station_count,
      null::text                    as local_municipality,
      s.district_municipality,
      s.province_name,
      s.province_slug,
      max(case when lower(unaccent(s.district_municipality)) like n.term || '%' then 1.0 else 0.0 end
        + similarity(lower(unaccent(s.district_municipality)), n.term))::real as score,
      entity.id as entity_id,
      'district_municipality'::text as entity_type
    from police_stations s
    cross join needle n
    left join geo_entities entity
      on entity.entity_type = 'district_municipality'
     and entity.slug = coalesce(s.province_slug, 'unassigned') || '/' || geo_slug(s.district_municipality)
    where n.term is not null
      and s.district_municipality is not null
      and (lower(unaccent(s.district_municipality)) like '%' || n.term || '%'
           or similarity(lower(unaccent(s.district_municipality)), n.term) > 0.3)
    group by entity.id, s.district_municipality, s.province_name, s.province_slug
  ),
  provinces as (
    select
      'province'::text     as result_type,
      s.province_name      as label,
      s.province_slug      as slug,
      null::bigint         as station_id,
      count(*)::integer    as station_count,
      null::text           as local_municipality,
      null::text           as district_municipality,
      s.province_name,
      s.province_slug,
      max(case when lower(unaccent(s.province_name)) like n.term || '%' then 1.0 else 0.0 end
        + similarity(lower(unaccent(s.province_name)), n.term))::real as score,
      entity.id as entity_id,
      'province'::text as entity_type
    from police_stations s
    cross join needle n
    left join geo_entities entity
      on entity.entity_type = 'province'
     and entity.slug = s.province_slug
    where n.term is not null
      and s.province_name is not null
      and (lower(unaccent(s.province_name)) like '%' || n.term || '%'
           or similarity(lower(unaccent(s.province_name)), n.term) > 0.3)
    group by entity.id, s.province_name, s.province_slug
  ),
  combined as (
    select * from stations
    union all select * from locals
    union all select * from districts
    union all select * from provinces
  )
  select
    result_type, label, slug, station_id, station_count,
    local_municipality, district_municipality, province_name, province_slug, score,
    entity_id, entity_type
  from combined
  order by
    score desc,
    case result_type
      when 'station' then 1
      when 'local_municipality' then 2
      when 'district_municipality' then 3
      else 4
    end,
    label asc
  limit greatest(1, least(coalesce(max_results, 10), 25));
$$;

comment on function search_locations is
  'Autocomplete across stations, municipalities, districts and provinces. Rows are one per geo entity, so the same municipality name in two provinces stays two results with two entity ids.';

grant execute on function search_locations(text, integer) to anon, authenticated;
