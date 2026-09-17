-- Preserve the source spelling of the station name alongside the readable one.
--
-- The source dataset stores station names entirely in lower case, for example
-- "king william's town" and "middelburg(ec)". Displaying that verbatim reads badly, so
-- police_stations.station_name holds a readable form derived by the pipeline and
-- station_name_source holds the exact source string, so nothing is lost and any display
-- rule can be checked against the original.

alter table police_stations
  add column if not exists station_name_source text;

comment on column police_stations.station_name is
  'Readable station name derived from the source spelling by the pipeline. Presentation only.';
comment on column police_stations.station_name_source is
  'The station name exactly as it appears in the source dataset, in lower case.';

create index if not exists police_stations_name_source_trgm_idx
  on police_stations using gin (station_name_source gin_trgm_ops);
