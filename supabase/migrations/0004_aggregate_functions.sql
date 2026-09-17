-- CrimeMap SA - aggregate query functions
--
-- Both functions return raw counts for a year and the year before it. Percentage change,
-- the small-base rules and ranking are applied afterwards by src/lib/metrics, so the rules
-- exist in one place only.

-- ---------------------------------------------------------------------------
-- Per-category totals for a financial year, optionally scoped to one province.
--
-- Feeds the "What's changing?" panel at national and provincial level. The record is unpivoted
-- with jsonb_each so a new source column does not require editing this function, and NULLs are
-- skipped rather than counted as zero.
-- ---------------------------------------------------------------------------

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

comment on function category_totals is 'Per-category recorded totals for a financial year and the year before it, optionally scoped to a province. NULL source values are skipped, never treated as zero.';

-- ---------------------------------------------------------------------------
-- Station-level headline totals for a province, used by the province index page.
-- ---------------------------------------------------------------------------

create or replace function province_station_totals(
  p_province_slug text,
  p_year          text default null
)
returns table (
  station_slug           text,
  station_name           text,
  local_municipality     text,
  district_municipality  text,
  province_name          text,
  province_slug          text,
  latitude               double precision,
  longitude              double precision,
  financial_year         text,
  total_recorded_crime   bigint,
  total_recorded_missing bigint,
  previous_total         bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select coalesce(p_year, (select lfy.financial_year from latest_financial_year() lfy)) as fy
  )
  select
    s.station_slug,
    s.station_name,
    s.local_municipality,
    s.district_municipality,
    s.province_name,
    s.province_slug,
    s.latitude,
    s.longitude,
    cur.financial_year,
    cur.total_recorded_crime,
    cur.total_recorded_missing,
    prev.total_recorded_crime as previous_total
  from police_stations s
  join crime_record_totals cur on cur.station_id = s.id
  cross join target t
  left join crime_record_totals prev
    on prev.station_id = s.id
   and prev.financial_year_start = cur.financial_year_start - 1
  where s.province_slug = p_province_slug
    and cur.financial_year = t.fy
  order by cur.total_recorded_crime desc nulls last, s.station_name asc;
$$;

comment on function province_station_totals is 'Headline recorded crime totals per police station in a province for one financial year, with the previous year for comparison.';

grant execute on function category_totals(text, text)          to anon, authenticated;
grant execute on function province_station_totals(text, text)   to anon, authenticated;
