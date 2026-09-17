-- Derive police_stations.geom from the source latitude and longitude.
--
-- The pipeline writes only the source coordinates and the database builds the geography, so the
-- point and the coordinates can never drift apart, and the pipeline never has to construct
-- PostGIS values over the REST API.
--
-- Coordinates outside South Africa's bounds are still stored as given, because source values are
-- never altered. The pipeline records a validation warning for them instead.

create or replace function police_stations_sync_geom()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.latitude is null or new.longitude is null then
    new.geom := null;
  else
    new.geom := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  end if;
  return new;
end;
$$;

drop trigger if exists police_stations_sync_geom_trigger on police_stations;
create trigger police_stations_sync_geom_trigger
  before insert or update of latitude, longitude on police_stations
  for each row execute function police_stations_sync_geom();

-- Backfill any rows already present.
update police_stations
   set geom = case
                when latitude is null or longitude is null then null
                else st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
              end;
