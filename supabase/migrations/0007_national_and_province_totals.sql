-- CrimeMap SA - national and provincial roll-ups
--
-- The home page and province pages need totals across many stations. Aggregating in Postgres
-- keeps the browser from downloading 1,205 stations to add them up, and keeps one definition of
-- the headline total. As everywhere else, these return raw counts only: percentage change and
-- the small-base rules are applied in src/lib/metrics.
--
-- A station that reports no figure for a category is skipped rather than counted as zero, so
-- stations_reporting is returned alongside every total to show how complete it is.

-- ---------------------------------------------------------------------------
-- Every financial year present in the data, most recent first.
-- Drives the year selectors, so the interface never offers a year with no data.
-- ---------------------------------------------------------------------------

create or replace function available_financial_years()
returns table (
  financial_year       text,
  financial_year_start integer,
  stations_reporting   integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    cr.financial_year,
    cr.financial_year_start,
    count(distinct cr.station_id)::integer as stations_reporting
  from crime_records cr
  group by cr.financial_year, cr.financial_year_start
  order by cr.financial_year_start desc;
$$;

comment on function available_financial_years is 'Financial years present in the data, most recent first, with the number of stations reporting in each.';

-- ---------------------------------------------------------------------------
-- National headline total for a financial year and the year before it.
-- ---------------------------------------------------------------------------

create or replace function national_totals(p_year text default null)
returns table (
  financial_year         text,
  financial_year_start   integer,
  total_recorded_crime   bigint,
  previous_total         bigint,
  stations_reporting     integer,
  stations_total         integer,
  categories_missing     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select coalesce(p_year, (select lfy.financial_year from latest_financial_year() lfy)) as fy
  ),
  target_start as (
    select t.fy, min(cr.financial_year_start) as fy_start
    from crime_records cr, target t
    where cr.financial_year = t.fy
    group by t.fy
  )
  select
    ts.fy                                                                       as financial_year,
    ts.fy_start                                                                 as financial_year_start,
    sum(crt.total_recorded_crime) filter (where crt.financial_year_start = ts.fy_start)     as total_recorded_crime,
    sum(crt.total_recorded_crime) filter (where crt.financial_year_start = ts.fy_start - 1) as previous_total,
    count(distinct crt.station_id) filter (where crt.financial_year_start = ts.fy_start)::integer
                                                                                as stations_reporting,
    (select count(*)::integer from police_stations)                             as stations_total,
    sum(crt.total_recorded_missing) filter (where crt.financial_year_start = ts.fy_start)   as categories_missing
  from crime_record_totals crt
  cross join target_start ts
  where crt.financial_year_start in (ts.fy_start, ts.fy_start - 1)
  group by ts.fy, ts.fy_start;
$$;

comment on function national_totals is 'National recorded crime total for a financial year with the previous year for comparison.';

-- ---------------------------------------------------------------------------
-- Per-province headline totals for a financial year and the year before it.
--
-- Ordered by province name, not by total. CrimeMap SA does not present provinces as a league
-- table; any ordering by size is something the reader chooses in the interface.
-- ---------------------------------------------------------------------------

create or replace function province_totals(p_year text default null)
returns table (
  province_slug        text,
  province_name        text,
  financial_year       text,
  total_recorded_crime bigint,
  previous_total       bigint,
  stations_reporting   integer,
  stations_total       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select coalesce(p_year, (select lfy.financial_year from latest_financial_year() lfy)) as fy
  ),
  target_start as (
    select t.fy, min(cr.financial_year_start) as fy_start
    from crime_records cr, target t
    where cr.financial_year = t.fy
    group by t.fy
  ),
  station_counts as (
    select province_slug, count(*)::integer as stations_total
    from police_stations
    where province_slug is not null
    group by province_slug
  )
  select
    s.province_slug,
    s.province_name,
    ts.fy                                                                       as financial_year,
    sum(crt.total_recorded_crime) filter (where crt.financial_year_start = ts.fy_start)     as total_recorded_crime,
    sum(crt.total_recorded_crime) filter (where crt.financial_year_start = ts.fy_start - 1) as previous_total,
    count(distinct crt.station_id) filter (where crt.financial_year_start = ts.fy_start)::integer
                                                                                as stations_reporting,
    max(sc.stations_total)                                                      as stations_total
  from crime_record_totals crt
  join police_stations s on s.id = crt.station_id
  left join station_counts sc on sc.province_slug = s.province_slug
  cross join target_start ts
  where crt.financial_year_start in (ts.fy_start, ts.fy_start - 1)
    and s.province_slug is not null
  group by s.province_slug, s.province_name, ts.fy, ts.fy_start
  order by s.province_name asc;
$$;

comment on function province_totals is 'Recorded crime totals per province for a financial year, ordered by province name rather than by size.';

-- ---------------------------------------------------------------------------
-- National trend across every available year, for the home page chart.
-- ---------------------------------------------------------------------------

create or replace function national_trend()
returns table (
  financial_year       text,
  financial_year_start integer,
  total_recorded_crime bigint,
  stations_reporting   integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    crt.financial_year,
    crt.financial_year_start,
    sum(crt.total_recorded_crime)              as total_recorded_crime,
    count(distinct crt.station_id)::integer    as stations_reporting
  from crime_record_totals crt
  group by crt.financial_year, crt.financial_year_start
  order by crt.financial_year_start asc;
$$;

comment on function national_trend is 'National recorded crime total for every financial year in the data, oldest first.';

grant execute on function available_financial_years()      to anon, authenticated;
grant execute on function national_totals(text)            to anon, authenticated;
grant execute on function province_totals(text)            to anon, authenticated;
grant execute on function national_trend()                 to anon, authenticated;
