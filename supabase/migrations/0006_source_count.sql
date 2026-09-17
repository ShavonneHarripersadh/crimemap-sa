-- Treat negative source values as missing in calculations, without altering stored source data.
--
-- The DataFirst file contains 1,203 negative offence counts, almost all in sexual-offence
-- columns, typically -1 or -2. Those cannot be real recorded-crime counts. CrimeMap SA stores
-- the source value unchanged (see crime_records and validation_warnings) and excludes it from
-- every total, change and map query. The UI shows "Not available" rather than a negative number.

create or replace function source_count(v integer)
returns integer
language sql
immutable
parallel safe
as $$
  select case when v is null or v < 0 then null else v end;
$$;

comment on function source_count is 'Maps a stored source count to a usable recorded-crime count: NULL and negative values become NULL. Zero is kept as zero. The stored crime_records value is never rewritten.';

-- Recreate the totals view so group sums do not subtract negative source codes.
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
    source_count(r.murder), source_count(r.attempted_murder), source_count(r.sexual_offences),
    source_count(r.assault_gbh), source_count(r.common_assault), source_count(r.common_robbery),
    source_count(r.aggr_robbery)
  ]) as u(v)
) contact
cross join lateral (
  select sum(v) as total, count(*) filter (where v is null) as missing
  from unnest(array[source_count(r.arson), source_count(r.malicious_damage)]) as u(v)
) related
cross join lateral (
  select sum(v) as total, count(*) filter (where v is null) as missing
  from unnest(array[
    source_count(r.burglary_res), source_count(r.burglary_nonres), source_count(r.vehicle_theft),
    source_count(r.theft_from_vehicle), source_count(r.stock_theft)
  ]) as u(v)
) property
cross join lateral (
  select sum(v) as total, count(*) filter (where v is null) as missing
  from unnest(array[
    source_count(r.other_theft), source_count(r.commercial_crime), source_count(r.shoplifting)
  ]) as u(v)
) other
cross join lateral (
  select sum(v) as total, count(*) filter (where v is null) as missing
  from unnest(array[
    source_count(r.illegal_firearms), source_count(r.drug_crime), source_count(r.dui),
    source_count(r.police_detected_sexoff)
  ]) as u(v)
) police
cross join lateral (
  select
    sum(v)                                as total,
    count(*) filter (where v is null)     as missing,
    count(*) filter (where v is not null) as present
  from unnest(array[
    source_count(r.murder), source_count(r.attempted_murder), source_count(r.sexual_offences),
    source_count(r.assault_gbh), source_count(r.common_assault), source_count(r.common_robbery),
    source_count(r.aggr_robbery),
    source_count(r.arson), source_count(r.malicious_damage),
    source_count(r.burglary_res), source_count(r.burglary_nonres), source_count(r.vehicle_theft),
    source_count(r.theft_from_vehicle), source_count(r.stock_theft),
    source_count(r.other_theft), source_count(r.commercial_crime), source_count(r.shoplifting)
  ]) as u(v)
) headline;

alter view crime_record_totals set (security_invoker = on);
grant select on crime_record_totals to anon, authenticated;

-- Recreate crime_metrics (depends on crime_record_totals).
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

alter view crime_metrics set (security_invoker = on);
grant select on crime_metrics to anon, authenticated;

-- Skip negative source codes when aggregating categories nationally / by province.
create or replace function category_totals(
  p_year           text default null,
  p_province_slug  text default null
)
returns table (
  column_name        text,
  current_total      bigint,
  previous_total     bigint,
  stations_reporting integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with allowed as (
    select array[
      'murder', 'attempted_murder', 'sexual_offences', 'assault_gbh', 'common_assault',
      'common_robbery', 'aggr_robbery', 'carjacking', 'robbery_res', 'robbery_nonres',
      'cash_transit_robbery', 'bank_robbery', 'truck_hijacking', 'rape', 'sexual_assault',
      'attempted_sexoff', 'contact_sexoff', 'arson', 'malicious_damage', 'burglary_res',
      'burglary_nonres', 'vehicle_theft', 'theft_from_vehicle', 'stock_theft', 'other_theft',
      'commercial_crime', 'shoplifting', 'illegal_firearms', 'drug_crime', 'dui',
      'police_detected_sexoff', 'kidnapping'
    ]::text[] as columns
  ),
  target as (
    select coalesce(p_year, (select lfy.financial_year from latest_financial_year() lfy)) as fy
  ),
  target_start as (
    select cr.financial_year_start as fy_start
    from crime_records cr, target t
    where cr.financial_year = t.fy
    limit 1
  ),
  scoped as (
    select cr.*
    from crime_records cr
    join police_stations s on s.id = cr.station_id
    cross join target_start ts
    where cr.financial_year_start in (ts.fy_start, ts.fy_start - 1)
      and (p_province_slug is null or s.province_slug = p_province_slug)
  ),
  unpivoted as (
    select
      sc.financial_year_start,
      sc.station_id,
      kv.key                       as column_name,
      (kv.value #>> '{}')::bigint  as value
    from scoped sc
    cross join lateral jsonb_each(to_jsonb(sc)) kv
    cross join allowed a
    where kv.key = any (a.columns)
      and kv.value <> 'null'::jsonb
      and (kv.value #>> '{}')::numeric >= 0
  )
  select
    u.column_name,
    sum(u.value) filter (where u.financial_year_start = ts.fy_start)                as current_total,
    sum(u.value) filter (where u.financial_year_start = ts.fy_start - 1)            as previous_total,
    count(distinct u.station_id) filter (where u.financial_year_start = ts.fy_start)::integer
                                                                                   as stations_reporting
  from unpivoted u
  cross join target_start ts
  group by u.column_name
  order by u.column_name;
$$;

-- Map popups must also treat negative source codes as unavailable.
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
    case when p_category = 'total_recorded_crime' then 'cur.total_recorded_crime'
         else 'source_count(cr.' || quote_ident(p_category) || ')' end,
    case when p_category = 'total_recorded_crime' then 'prev.total_recorded_crime'
         else 'source_count(prevr.' || quote_ident(p_category) || ')' end
  )
  using p_west, p_south, p_east, p_north, target_year, greatest(1, least(coalesce(p_limit, 500), 2000));
end;
$$;
