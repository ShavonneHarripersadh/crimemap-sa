-- Category-level national trend and provincial totals for the intelligence layer.
-- Raw counts only. Percentages, small-base rules and unusual-movement classification stay in
-- src/lib/metrics. Missing source values are skipped, never treated as zero.

create or replace function national_category_trend(p_category text)
returns table (
  financial_year       text,
  financial_year_start integer,
  category_value       bigint,
  stations_reporting   integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  allowed constant text[] := array[
    'murder', 'attempted_murder', 'sexual_offences', 'assault_gbh', 'common_assault',
    'common_robbery', 'aggr_robbery', 'carjacking', 'robbery_res', 'robbery_nonres',
    'cash_transit_robbery', 'bank_robbery', 'truck_hijacking', 'rape', 'sexual_assault',
    'attempted_sexoff', 'contact_sexoff', 'arson', 'malicious_damage', 'burglary_res',
    'burglary_nonres', 'vehicle_theft', 'theft_from_vehicle', 'stock_theft', 'other_theft',
    'commercial_crime', 'shoplifting', 'illegal_firearms', 'drug_crime', 'dui',
    'police_detected_sexoff', 'kidnapping'
  ];
begin
  if p_category is null or not (
    p_category = 'total_recorded_crime' or p_category = any (allowed)
  ) then
    raise exception 'Unknown crime category: %', p_category;
  end if;

  if p_category = 'total_recorded_crime' then
    return query
    select
      crt.financial_year,
      crt.financial_year_start::integer,
      sum(crt.total_recorded_crime),
      count(distinct crt.station_id)::integer
    from crime_record_totals crt
    group by crt.financial_year, crt.financial_year_start
    order by crt.financial_year_start asc;
    return;
  end if;

  return query execute format(
    $f$
      select
        cr.financial_year,
        cr.financial_year_start::integer,
        sum(source_count(cr.%I))::bigint as category_value,
        count(*) filter (where source_count(cr.%I) is not null)::integer as stations_reporting
      from crime_records cr
      group by cr.financial_year, cr.financial_year_start
      order by cr.financial_year_start asc
    $f$,
    p_category,
    p_category
  );
end;
$$;

comment on function national_category_trend is
  'National recorded totals for one source category (or the headline total) for every financial year. NULL source values are skipped.';

create or replace function province_category_totals(
  p_category text,
  p_year     text default null
)
returns table (
  province_slug        text,
  province_name        text,
  financial_year       text,
  current_total        bigint,
  previous_total       bigint,
  stations_reporting   integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  allowed constant text[] := array[
    'murder', 'attempted_murder', 'sexual_offences', 'assault_gbh', 'common_assault',
    'common_robbery', 'aggr_robbery', 'carjacking', 'robbery_res', 'robbery_nonres',
    'cash_transit_robbery', 'bank_robbery', 'truck_hijacking', 'rape', 'sexual_assault',
    'attempted_sexoff', 'contact_sexoff', 'arson', 'malicious_damage', 'burglary_res',
    'burglary_nonres', 'vehicle_theft', 'theft_from_vehicle', 'stock_theft', 'other_theft',
    'commercial_crime', 'shoplifting', 'illegal_firearms', 'drug_crime', 'dui',
    'police_detected_sexoff', 'kidnapping'
  ];
  target_year text;
  target_start integer;
begin
  if p_category is null or not (
    p_category = 'total_recorded_crime' or p_category = any (allowed)
  ) then
    raise exception 'Unknown crime category: %', p_category;
  end if;

  select coalesce(p_year, lfy.financial_year) into target_year
  from latest_financial_year() lfy;

  select min(cr.financial_year_start)::integer into target_start
  from crime_records cr
  where cr.financial_year = target_year;

  if target_start is null then
    return;
  end if;

  if p_category = 'total_recorded_crime' then
    return query
    select
      s.province_slug,
      s.province_name,
      target_year,
      sum(crt.total_recorded_crime) filter (where crt.financial_year_start = target_start),
      sum(crt.total_recorded_crime) filter (where crt.financial_year_start = target_start - 1),
      count(distinct crt.station_id) filter (where crt.financial_year_start = target_start)::integer
    from crime_record_totals crt
    join police_stations s on s.id = crt.station_id
    where crt.financial_year_start in (target_start, target_start - 1)
      and s.province_slug is not null
    group by s.province_slug, s.province_name
    order by s.province_name asc;
    return;
  end if;

  return query execute format(
    $f$
      select
        s.province_slug,
        s.province_name,
        $1::text,
        sum(source_count(cr.%I)) filter (where cr.financial_year_start = $2),
        sum(source_count(cr.%I)) filter (where cr.financial_year_start = $2 - 1),
        count(distinct cr.station_id) filter (
          where cr.financial_year_start = $2 and source_count(cr.%I) is not null
        )::integer
      from crime_records cr
      join police_stations s on s.id = cr.station_id
      where cr.financial_year_start in ($2, $2 - 1)
        and s.province_slug is not null
      group by s.province_slug, s.province_name
      order by s.province_name asc
    $f$,
    p_category,
    p_category,
    p_category
  )
  using target_year, target_start;
end;
$$;

comment on function province_category_totals is
  'Per-province recorded totals for one source category and the previous financial year. Ordered by province name. NULL source values are skipped.';

grant execute on function national_category_trend(text) to anon, authenticated;
grant execute on function province_category_totals(text, text) to anon, authenticated;
