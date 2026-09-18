-- Yearly recorded totals for one source category in one province.
-- Used when a category page is filtered to a province so the chart and snapshot can follow.

create or replace function province_category_trend(
  p_category      text,
  p_province_slug text
)
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
  if p_province_slug is null or length(trim(p_province_slug)) = 0 then
    raise exception 'A province slug is required';
  end if;

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
    join police_stations s on s.id = crt.station_id
    where s.province_slug = p_province_slug
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
      join police_stations s on s.id = cr.station_id
      where s.province_slug = $1
      group by cr.financial_year, cr.financial_year_start
      order by cr.financial_year_start asc
    $f$,
    p_category,
    p_category
  )
  using p_province_slug;
end;
$$;

comment on function province_category_trend is
  'Recorded totals for one source category in one province, every financial year. NULL source values are skipped.';

grant execute on function province_category_trend(text, text) to anon, authenticated;
