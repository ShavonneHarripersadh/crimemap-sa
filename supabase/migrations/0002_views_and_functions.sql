-- CrimeMap SA - derived views and query functions
--
-- Deliberate architecture decision (see /methodology and docs/decisions.md):
--
-- Percentage change, trend direction and "what's changing" ranking are NOT computed in SQL.
-- They live in one tested TypeScript module (src/lib/metrics/) so the rules for a zero base,
-- a missing value and a small base exist in exactly one place. SQL supplies the raw building
-- blocks (current, previous and five-years-prior counts) and nothing more.
--
-- These are plain views rather than materialised views. Area profiles read a single station's
-- rows on an indexed key and the map reads a bounding box, so materialisation is not yet
-- justified. Revisit only if query plans show it is needed.

-- ---------------------------------------------------------------------------
-- Group totals per source record
--
-- sum() over unnest() ignores NULLs and returns NULL when every component is NULL, which is
-- exactly the behaviour required: a missing value must not become a zero. The companion
-- *_missing column tells the application how many components were unavailable so the UI can
-- disclose that a total is partial instead of presenting it as complete.
-- ---------------------------------------------------------------------------

create or replace view crime_record_totals as
select
  r.id                    as record_id,
  r.station_id,
  r.financial_year,
  r.financial_year_source,
  r.financial_year_start,

  contact.total           as contact_crime_total,
  contact.missing         as contact_crime_missing,
  related.total           as contact_related_total,
  related.missing         as contact_related_missing,
  property.total          as property_crime_total,
  property.missing        as property_crime_missing,
  other.total             as other_serious_total,
  other.missing           as other_serious_missing,
  police.total            as police_action_total,
  police.missing          as police_action_missing,

  headline.total          as total_recorded_crime,
  headline.missing        as total_recorded_missing,
  headline.present        as total_recorded_present
from crime_records r
cross join lateral (
  select sum(v) as total, count(*) filter (where v is null) as missing
  from unnest(array[
    r.murder, r.attempted_murder, r.sexual_offences, r.assault_gbh,
    r.common_assault, r.common_robbery, r.aggr_robbery
  ]) as u(v)
) contact
cross join lateral (
  select sum(v) as total, count(*) filter (where v is null) as missing
  from unnest(array[r.arson, r.malicious_damage]) as u(v)
) related
cross join lateral (
  select sum(v) as total, count(*) filter (where v is null) as missing
  from unnest(array[
    r.burglary_res, r.burglary_nonres, r.vehicle_theft, r.theft_from_vehicle, r.stock_theft
  ]) as u(v)
) property
cross join lateral (
  select sum(v) as total, count(*) filter (where v is null) as missing
  from unnest(array[r.other_theft, r.commercial_crime, r.shoplifting]) as u(v)
) other
cross join lateral (
  select sum(v) as total, count(*) filter (where v is null) as missing
  from unnest(array[r.illegal_firearms, r.drug_crime, r.dui, r.police_detected_sexoff]) as u(v)
) police
cross join lateral (
  select
    sum(v)                                  as total,
    count(*) filter (where v is null)       as missing,
    count(*) filter (where v is not null)   as present
  from unnest(array[
    r.murder, r.attempted_murder, r.sexual_offences, r.assault_gbh,
    r.common_assault, r.common_robbery, r.aggr_robbery,
    r.arson, r.malicious_damage,
    r.burglary_res, r.burglary_nonres, r.vehicle_theft, r.theft_from_vehicle, r.stock_theft,
    r.other_theft, r.commercial_crime, r.shoplifting
  ]) as u(v)
) headline;

comment on view crime_record_totals is 'Group totals following the SAPS published structure. total_recorded_crime is the 17 community-reported serious crimes and excludes crimes detected by police action and kidnapping.';

-- ---------------------------------------------------------------------------
-- Comparison context: each record alongside the previous year and five years prior
-- ---------------------------------------------------------------------------

create or replace view crime_metrics as
select
  t.station_id,
  t.financial_year,
  t.financial_year_start,
  t.total_recorded_crime,
  t.total_recorded_missing,
  t.contact_crime_total,
  t.contact_related_total,
  t.property_crime_total,
  t.other_serious_total,
  t.police_action_total,
  prev.financial_year        as previous_financial_year,
  prev.total_recorded_crime  as previous_total_recorded_crime,
  five.financial_year        as five_year_prior_financial_year,
  five.total_recorded_crime  as five_year_prior_total_recorded_crime
from crime_record_totals t
left join crime_record_totals prev
  on prev.station_id = t.station_id
 and prev.financial_year_start = t.financial_year_start - 1
left join crime_record_totals five
  on five.station_id = t.station_id
 and five.financial_year_start = t.financial_year_start - 5;

comment on view crime_metrics is 'Raw comparison inputs only. Percentages and trend labels are derived in src/lib/metrics so the zero-base, missing-value and small-base rules exist in one place.';

-- ---------------------------------------------------------------------------
-- Latest financial year actually present in the data
-- ---------------------------------------------------------------------------

create or replace function latest_financial_year()
returns table (financial_year text, financial_year_start smallint)
language sql
stable
security invoker
set search_path = public
as $$
  select financial_year, financial_year_start
  from crime_records
  order by financial_year_start desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Search across stations, municipalities, districts and provinces
--
-- Ordering is fully deterministic: score, then result type, then label.
-- ---------------------------------------------------------------------------

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
  score                 real
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
        + similarity(lower(unaccent(s.station_name)), n.term))::real as score
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
        + similarity(lower(unaccent(s.local_municipality)), n.term))::real as score
    from police_stations s, needle n
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
        + similarity(lower(unaccent(s.district_municipality)), n.term))::real as score
    from police_stations s, needle n
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
        + similarity(lower(unaccent(s.province_name)), n.term))::real as score
    from police_stations s, needle n
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
    local_municipality, district_municipality, province_name, province_slug, score
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

comment on function search_locations is 'Autocomplete across police stations, local municipalities, district municipalities and provinces. Every result carries its type so the UI can label it.';

-- ---------------------------------------------------------------------------
-- Map: stations inside a bounding box for one financial year and one category
--
-- Returns the raw current and previous counts. The percentage change is derived in
-- TypeScript by the shared metrics module. p_category is validated against the real source
-- columns; anything else raises rather than silently returning wrong numbers.
-- ---------------------------------------------------------------------------

create or replace function stations_in_bbox(
  p_west     double precision,
  p_south    double precision,
  p_east     double precision,
  p_north    double precision,
  p_year     text default null,
  p_category text default 'total_recorded_crime',
  p_limit    integer default 500
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
  financial_year        text,
  category_value        integer,
  previous_value        integer,
  total_recorded_crime  bigint,
  previous_total        bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  allowed text[] := array[
    'total_recorded_crime',
    'murder', 'attempted_murder', 'sexual_offences', 'assault_gbh', 'common_assault',
    'common_robbery', 'aggr_robbery', 'carjacking', 'robbery_res', 'robbery_nonres',
    'cash_transit_robbery', 'bank_robbery', 'truck_hijacking', 'rape', 'sexual_assault',
    'attempted_sexoff', 'contact_sexoff', 'arson', 'malicious_damage', 'burglary_res',
    'burglary_nonres', 'vehicle_theft', 'theft_from_vehicle', 'stock_theft', 'other_theft',
    'commercial_crime', 'shoplifting', 'illegal_firearms', 'drug_crime', 'dui',
    'police_detected_sexoff', 'kidnapping'
  ];
  target_year text;
begin
  if p_category is null or not (p_category = any (allowed)) then
    raise exception 'Unknown crime category: %', p_category;
  end if;

  target_year := coalesce(p_year, (select lfy.financial_year from latest_financial_year() lfy));

  return query execute format($fmt$
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
      cur.financial_year,
      %1$s::integer as category_value,
      %2$s::integer as previous_value,
      cur.total_recorded_crime,
      prev.total_recorded_crime as previous_total
    from police_stations s
    join crime_record_totals cur
      on cur.station_id = s.id and cur.financial_year = $5
    join crime_records cr on cr.id = cur.record_id
    left join crime_record_totals prev
      on prev.station_id = s.id and prev.financial_year_start = cur.financial_year_start - 1
    left join crime_records prevr on prevr.id = prev.record_id
    where s.geom is not null
      and st_intersects(
            s.geom,
            st_makeenvelope($1, $2, $3, $4, 4326)::geography
          )
    order by %1$s desc nulls last, s.station_name asc
    limit $6
  $fmt$,
    case when p_category = 'total_recorded_crime' then 'cur.total_recorded_crime' else 'cr.' || quote_ident(p_category) end,
    case when p_category = 'total_recorded_crime' then 'prev.total_recorded_crime' else 'prevr.' || quote_ident(p_category) end
  )
  using p_west, p_south, p_east, p_north, target_year, greatest(1, least(coalesce(p_limit, 500), 2000));
end;
$$;

comment on function stations_in_bbox is 'PostGIS bounding-box query for the map. Returns raw counts only; percentage change is derived in the shared TypeScript metrics module.';
