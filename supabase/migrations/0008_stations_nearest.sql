-- Nearest police stations to a point. Used when a search matches a suburb or other
-- place name that is not itself a station, municipality, district or province.
-- Distance is geographic; this is not an official precinct assignment.

create or replace function stations_nearest(
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
  distance_meters       double precision
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
    ) as distance_meters
  from police_stations s
  where s.geom is not null
  order by s.geom <-> st_setsrid(st_makepoint(p_lng, p_lat), 4326)
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;

comment on function stations_nearest is
  'Nearest police stations to a longitude/latitude. Used for suburb searches; not an official precinct lookup.';

grant execute on function stations_nearest(double precision, double precision, integer) to anon, authenticated;
