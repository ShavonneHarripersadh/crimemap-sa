-- Location intelligence, phase 1.
--
-- Additive only. Crime rows stay on police_stations. These tables name the
-- geographic entities those stations already imply, and link them without a
-- parent_id. A station coordinate is not a precinct polygon.

create or replace function geo_slug(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    trim(both '-' from regexp_replace(lower(unaccent(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;

comment on function geo_slug is 'Stable slug for geographic names copied from SAPS station attributes. Not a boundary identifier.';

-- ---------------------------------------------------------------------------
-- Canonical entities. New types do not require a new enum.
-- ---------------------------------------------------------------------------

create table if not exists geo_entities (
  id            bigserial primary key,
  entity_type   text not null,
  name          text not null,
  slug          text not null,
  source        text not null,
  source_id     text,
  centroid_lat  double precision,
  centroid_lng  double precision,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint geo_entities_type_slug_key unique (entity_type, slug)
);

comment on table geo_entities is 'Stable geographic entities. Crime records do not live here; they stay on police stations.';
comment on column geo_entities.centroid_lat is 'A point for display. For police_station this is the station coordinate, not a precinct boundary. For a municipality it is the mean of member station coordinates, not a municipal boundary.';
comment on column geo_entities.source_id is 'Identifier in the source that created the row, such as a station slug. Not a foreign key.';

create index if not exists geo_entities_type_idx on geo_entities (entity_type);
create index if not exists geo_entities_name_trgm_idx on geo_entities using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Independent relationships. relation_type is free text so a new kind of
-- link (served_by, nearest_station, intersects) does not need a migration.
-- ---------------------------------------------------------------------------

create table if not exists geo_relationships (
  id              bigserial primary key,
  from_entity_id  bigint not null references geo_entities (id) on delete cascade,
  to_entity_id    bigint not null references geo_entities (id) on delete cascade,
  relation_type   text not null,
  source_id       bigint references data_sources (id) on delete set null,
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  constraint geo_relationships_endpoints_key unique (from_entity_id, to_entity_id, relation_type),
  constraint geo_relationships_not_self check (from_entity_id <> to_entity_id)
);

comment on table geo_relationships is 'Many-to-many links between entities. within, served_by and later types are rows, not columns.';
comment on column geo_relationships.metadata is 'Provenance for this link, such as which station attribute it was copied from. Not a place to store crime counts.';

create index if not exists geo_relationships_from_idx on geo_relationships (from_entity_id, relation_type);
create index if not exists geo_relationships_to_idx on geo_relationships (to_entity_id, relation_type);

-- ---------------------------------------------------------------------------
-- What is actually loaded for an entity. New dataset keys need no migration.
-- ---------------------------------------------------------------------------

create table if not exists dataset_coverage (
  id           bigserial primary key,
  entity_id    bigint not null references geo_entities (id) on delete cascade,
  dataset_key  text not null,
  status       text not null check (status in ('available', 'partial', 'unavailable')),
  as_of        text,
  updated_at   timestamptz not null default now(),
  constraint dataset_coverage_entity_dataset_key unique (entity_id, dataset_key)
);

comment on table dataset_coverage is 'Whether a dataset has been loaded for an entity. Absence of a row means the dataset has not been assessed, not that it is complete.';

create index if not exists dataset_coverage_dataset_idx on dataset_coverage (dataset_key, status);

drop trigger if exists geo_entities_set_updated_at on geo_entities;
create trigger geo_entities_set_updated_at
  before update on geo_entities
  for each row execute function set_updated_at();

drop trigger if exists dataset_coverage_set_updated_at on dataset_coverage;
create trigger dataset_coverage_set_updated_at
  before update on dataset_coverage
  for each row execute function set_updated_at();

alter table geo_entities      enable row level security;
alter table geo_relationships enable row level security;
alter table dataset_coverage  enable row level security;

drop policy if exists geo_entities_public_read on geo_entities;
create policy geo_entities_public_read
  on geo_entities for select
  to anon, authenticated
  using (true);

drop policy if exists geo_relationships_public_read on geo_relationships;
create policy geo_relationships_public_read
  on geo_relationships for select
  to anon, authenticated
  using (true);

drop policy if exists dataset_coverage_public_read on dataset_coverage;
create policy dataset_coverage_public_read
  on dataset_coverage for select
  to anon, authenticated
  using (true);

grant select on geo_entities, geo_relationships, dataset_coverage to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Link stations. station_slug remains the public identifier.
-- ---------------------------------------------------------------------------

alter table police_stations
  add column if not exists entity_id bigint references geo_entities (id) on delete set null;

comment on column police_stations.entity_id is 'Optional link to the police_station geo entity. Crime rows still reference police_stations.id.';

create unique index if not exists police_stations_entity_id_key
  on police_stations (entity_id)
  where entity_id is not null;

-- ---------------------------------------------------------------------------
-- Backfill from existing station attributes. No suburb import.
-- ---------------------------------------------------------------------------

insert into geo_entities (entity_type, name, slug, source, source_id)
select distinct
  'province',
  province_name,
  province_slug,
  'saps-station-attributes',
  province_slug
from police_stations
where province_slug is not null
  and province_name is not null
on conflict (entity_type, slug) do nothing;

insert into geo_entities (entity_type, name, slug, source, source_id, centroid_lat, centroid_lng)
select
  'local_municipality',
  local_municipality,
  coalesce(province_slug, 'unassigned') || '/' || geo_slug(local_municipality),
  'saps-station-attributes',
  coalesce(province_slug, 'unassigned') || '/' || geo_slug(local_municipality),
  avg(latitude),
  avg(longitude)
from police_stations
where local_municipality is not null
  and geo_slug(local_municipality) is not null
group by province_slug, local_municipality
on conflict (entity_type, slug) do nothing;

insert into geo_entities (entity_type, name, slug, source, source_id, centroid_lat, centroid_lng)
select
  'district_municipality',
  district_municipality,
  coalesce(province_slug, 'unassigned') || '/' || geo_slug(district_municipality),
  'saps-station-attributes',
  coalesce(province_slug, 'unassigned') || '/' || geo_slug(district_municipality),
  avg(latitude),
  avg(longitude)
from police_stations
where district_municipality is not null
  and geo_slug(district_municipality) is not null
group by province_slug, district_municipality
on conflict (entity_type, slug) do nothing;

insert into geo_entities (entity_type, name, slug, source, source_id, centroid_lat, centroid_lng)
select
  'police_station',
  station_name,
  station_slug,
  'saps-station-attributes',
  station_slug,
  latitude,
  longitude
from police_stations
on conflict (entity_type, slug) do nothing;

update police_stations as station
set entity_id = entity.id
from geo_entities as entity
where entity.entity_type = 'police_station'
  and entity.slug = station.station_slug
  and station.entity_id is null;

insert into geo_relationships (from_entity_id, to_entity_id, relation_type, source_id, metadata)
select distinct
  station.entity_id,
  municipality.id,
  'within',
  data_source.id,
  jsonb_build_object('basis', 'saps_station_attribute', 'attribute', 'local_municipality')
from police_stations as station
join geo_entities as municipality
  on municipality.entity_type = 'local_municipality'
 and municipality.slug = coalesce(station.province_slug, 'unassigned') || '/' || geo_slug(station.local_municipality)
left join data_sources as data_source
  on data_source.source_key = 'datafirst-saps-annual-crime-records'
where station.entity_id is not null
  and station.local_municipality is not null
on conflict (from_entity_id, to_entity_id, relation_type) do nothing;

insert into geo_relationships (from_entity_id, to_entity_id, relation_type, source_id, metadata)
select distinct
  station.entity_id,
  district.id,
  'within',
  data_source.id,
  jsonb_build_object('basis', 'saps_station_attribute', 'attribute', 'district_municipality')
from police_stations as station
join geo_entities as district
  on district.entity_type = 'district_municipality'
 and district.slug = coalesce(station.province_slug, 'unassigned') || '/' || geo_slug(station.district_municipality)
left join data_sources as data_source
  on data_source.source_key = 'datafirst-saps-annual-crime-records'
where station.entity_id is not null
  and station.district_municipality is not null
on conflict (from_entity_id, to_entity_id, relation_type) do nothing;

insert into geo_relationships (from_entity_id, to_entity_id, relation_type, source_id, metadata)
select distinct
  station.entity_id,
  province.id,
  'within',
  data_source.id,
  jsonb_build_object('basis', 'saps_station_attribute', 'attribute', 'province')
from police_stations as station
join geo_entities as province
  on province.entity_type = 'province'
 and province.slug = station.province_slug
left join data_sources as data_source
  on data_source.source_key = 'datafirst-saps-annual-crime-records'
where station.entity_id is not null
  and station.province_slug is not null
on conflict (from_entity_id, to_entity_id, relation_type) do nothing;

insert into geo_relationships (from_entity_id, to_entity_id, relation_type, source_id, metadata)
select distinct
  municipality.id,
  province.id,
  'within',
  data_source.id,
  jsonb_build_object('basis', 'saps_station_attribute', 'attribute', 'stations_in_both')
from geo_entities as municipality
join police_stations as station
  on municipality.entity_type = 'local_municipality'
 and municipality.slug = coalesce(station.province_slug, 'unassigned') || '/' || geo_slug(station.local_municipality)
join geo_entities as province
  on province.entity_type = 'province'
 and province.slug = station.province_slug
left join data_sources as data_source
  on data_source.source_key = 'datafirst-saps-annual-crime-records'
on conflict (from_entity_id, to_entity_id, relation_type) do nothing;

insert into geo_relationships (from_entity_id, to_entity_id, relation_type, source_id, metadata)
select distinct
  district.id,
  province.id,
  'within',
  data_source.id,
  jsonb_build_object('basis', 'saps_station_attribute', 'attribute', 'stations_in_both')
from geo_entities as district
join police_stations as station
  on district.entity_type = 'district_municipality'
 and district.slug = coalesce(station.province_slug, 'unassigned') || '/' || geo_slug(station.district_municipality)
join geo_entities as province
  on province.entity_type = 'province'
 and province.slug = station.province_slug
left join data_sources as data_source
  on data_source.source_key = 'datafirst-saps-annual-crime-records'
on conflict (from_entity_id, to_entity_id, relation_type) do nothing;

insert into dataset_coverage (entity_id, dataset_key, status, as_of)
select
  station.entity_id,
  'crime',
  case when count(record.id) > 0 then 'available' else 'unavailable' end,
  max(record.financial_year)
from police_stations as station
left join crime_records as record on record.station_id = station.id
where station.entity_id is not null
group by station.entity_id
on conflict (entity_id, dataset_key) do nothing;

insert into dataset_coverage (entity_id, dataset_key, status, as_of)
select
  area.id,
  'crime',
  case when count(record.id) > 0 then 'available' else 'unavailable' end,
  max(record.financial_year)
from geo_entities as area
join geo_relationships as link
  on link.to_entity_id = area.id
 and link.relation_type = 'within'
join police_stations as station on station.entity_id = link.from_entity_id
left join crime_records as record on record.station_id = station.id
where area.entity_type in ('province', 'local_municipality', 'district_municipality')
group by area.id
on conflict (entity_id, dataset_key) do nothing;

-- ---------------------------------------------------------------------------
-- Search keeps its existing columns and adds the entity link.
-- Return type changes, so the function has to be replaced.
-- ---------------------------------------------------------------------------

drop function if exists search_locations(text, integer);

create function search_locations(q text, max_results integer default 10)
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
      min(s.province_name)         as province_name,
      min(s.province_slug)         as province_slug,
      max(case when lower(unaccent(s.local_municipality)) like n.term || '%' then 1.0 else 0.0 end
        + similarity(lower(unaccent(s.local_municipality)), n.term))::real as score,
      min(entity.id) as entity_id,
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
    group by s.local_municipality
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
      min(s.province_name)          as province_name,
      min(s.province_slug)          as province_slug,
      max(case when lower(unaccent(s.district_municipality)) like n.term || '%' then 1.0 else 0.0 end
        + similarity(lower(unaccent(s.district_municipality)), n.term))::real as score,
      min(entity.id) as entity_id,
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
    group by s.district_municipality
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
      min(entity.id) as entity_id,
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
    group by s.province_name, s.province_slug
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

comment on function search_locations is 'Autocomplete across police stations, local municipalities, district municipalities and provinces. entity_id and entity_type are added beside the existing columns.';

grant execute on function search_locations(text, integer) to anon, authenticated;

-- Nearest-station search results can carry the same entity link.
-- Existing columns stay in place; entity_id and entity_type are appended.

drop function if exists stations_nearest(double precision, double precision, integer);

create function stations_nearest(
  p_lng   double precision,
  p_lat   double precision,
  p_limit integer default 5
)
returns table (
  station_id            bigint,
  station_slug          text,
  station_name          text,
  local_municipality    text,
  district_municipality text,
  province_name         text,
  province_slug         text,
  latitude              double precision,
  longitude             double precision,
  distance_meters       double precision,
  entity_id             bigint,
  entity_type           text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.id,
    s.station_slug,
    s.station_name,
    s.local_municipality,
    s.district_municipality,
    s.province_name,
    s.province_slug,
    s.latitude,
    s.longitude,
    st_distance(
      s.geom::geography,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    ) as distance_meters,
    s.entity_id,
    case when s.entity_id is null then null else 'police_station' end as entity_type
  from police_stations s
  where s.geom is not null
  order by s.geom <-> st_setsrid(st_makepoint(p_lng, p_lat), 4326)
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;

comment on function stations_nearest is
  'Nearest police stations to a longitude/latitude. Used for suburb searches; not an official precinct lookup. entity_id and entity_type are appended.';

grant execute on function stations_nearest(double precision, double precision, integer) to anon, authenticated;
