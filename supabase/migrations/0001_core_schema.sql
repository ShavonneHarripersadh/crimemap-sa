-- CrimeMap SA - core schema
--
-- Design notes that matter for correctness:
--
-- 1. Offence columns are nullable and have NO check constraint. NULL means the source did not
--    provide a value; 0 means the source recorded zero. These are never interchangeable.
--    Negative or implausible values are recorded in validation_warnings with the original value
--    preserved rather than rejected at the database level, so that a single odd source value
--    cannot silently drop a whole record.
--
-- 2. Only columns that exist in the source dataset are stored as source data. Province and
--    station_slug are CrimeMap SA derivations and are named and documented as such.
--
-- 3. financial_year keeps the source string alongside a canonical display form and an integer
--    start year for ordering, so the source financial year is never lost or converted to a
--    calendar year.

create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ---------------------------------------------------------------------------
-- Source and ingestion bookkeeping
-- ---------------------------------------------------------------------------

create table if not exists data_sources (
  id                bigserial primary key,
  source_key        text not null unique,
  organisation      text not null,
  distributor       text,
  dataset_name      text not null,
  dataset_version   text,
  dataset_url       text,
  doi               text,
  licence           text,
  earliest_period   text,
  latest_period     text,
  unit_of_observation text,
  retrieved_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table data_sources is 'Provenance for every dataset loaded into CrimeMap SA. Surfaced on /methodology and in the footer.';

create table if not exists ingest_runs (
  id                bigserial primary key,
  source_key        text not null,
  dataset_version   text,
  input_file        text,
  input_sha256      text,
  status            text not null check (status in ('running', 'succeeded', 'failed')),
  is_synthetic      boolean not null default false,
  rows_read         integer,
  stations_upserted integer,
  records_upserted  integer,
  error_count       integer not null default 0,
  warning_count     integer not null default 0,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  notes             text
);

comment on column ingest_runs.is_synthetic is 'True when the load came from a development fixture rather than the real source dataset. The application refuses to present synthetic data as real.';

create index if not exists ingest_runs_started_at_idx on ingest_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Police stations
-- ---------------------------------------------------------------------------

create table if not exists police_stations (
  id                      bigserial primary key,
  station_slug            text not null unique,
  station_name            text not null,
  district_municipality   text,
  local_municipality      text,
  province_code           text,
  province_name           text,
  province_slug           text,
  latitude                double precision,
  longitude               double precision,
  geom                    geography(Point, 4326),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on column police_stations.station_slug is 'CrimeMap SA derivation: deterministic slug of the source station name, used in URLs. The source dataset has no station code.';
comment on column police_stations.province_code is 'CrimeMap SA derivation from district_municipality via data/reference/province_by_district.csv. NULL when the district could not be matched; never guessed.';

create index if not exists police_stations_geom_idx on police_stations using gist (geom);
create index if not exists police_stations_province_idx on police_stations (province_slug);
create index if not exists police_stations_local_mn_idx on police_stations (local_municipality);
create index if not exists police_stations_district_mn_idx on police_stations (district_municipality);
create index if not exists police_stations_name_trgm_idx on police_stations using gin (station_name gin_trgm_ops);
create index if not exists police_stations_local_mn_trgm_idx on police_stations using gin (local_municipality gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Crime records - one row per station per financial year, source values only
-- ---------------------------------------------------------------------------

create table if not exists crime_records (
  id                      bigserial primary key,
  station_id              bigint not null references police_stations (id) on delete cascade,
  financial_year          text not null,
  financial_year_source   text not null,
  financial_year_start    smallint not null,

  -- Contact crime (headline)
  murder                  integer,
  attempted_murder        integer,
  sexual_offences         integer,
  assault_gbh             integer,
  common_assault          integer,
  common_robbery          integer,
  aggr_robbery            integer,

  -- Subcategories of robbery with aggravating circumstances
  carjacking              integer,
  robbery_res             integer,
  robbery_nonres          integer,
  cash_transit_robbery    integer,
  bank_robbery            integer,
  truck_hijacking         integer,

  -- Subcategories of sexual offences
  rape                    integer,
  sexual_assault          integer,
  attempted_sexoff        integer,
  contact_sexoff          integer,

  -- Contact-related crime
  arson                   integer,
  malicious_damage        integer,

  -- Property-related crime
  burglary_res            integer,
  burglary_nonres         integer,
  vehicle_theft           integer,
  theft_from_vehicle      integer,
  stock_theft             integer,

  -- Other serious crime
  other_theft             integer,
  commercial_crime        integer,
  shoplifting             integer,

  -- Crime detected as a result of police action
  illegal_firearms        integer,
  drug_crime              integer,
  dui                     integer,
  police_detected_sexoff  integer,

  -- Present in the source but not part of the 17 or the 4
  kidnapping              integer,

  raw_source_id           text,
  ingest_run_id           bigint references ingest_runs (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint crime_records_station_year_key unique (station_id, financial_year)
);

comment on table crime_records is 'Source-level annual observations exactly as distributed, with no imputation. One row per police station per financial year.';
comment on column crime_records.financial_year is 'Canonical display form, e.g. 2024/25.';
comment on column crime_records.financial_year_source is 'The financial year string exactly as it appeared in the source file.';
comment on column crime_records.raw_source_id is 'Deterministic identifier of the source row, used for idempotent upserts.';

create index if not exists crime_records_station_idx on crime_records (station_id);
create index if not exists crime_records_fy_idx on crime_records (financial_year);
create index if not exists crime_records_fy_start_idx on crime_records (financial_year_start);
create index if not exists crime_records_station_fy_start_idx on crime_records (station_id, financial_year_start desc);

-- ---------------------------------------------------------------------------
-- Validation warnings - flagged, never silently corrected
-- ---------------------------------------------------------------------------

create table if not exists validation_warnings (
  id              bigserial primary key,
  ingest_run_id   bigint references ingest_runs (id) on delete cascade,
  severity        text not null check (severity in ('error', 'warning', 'info')),
  check_id        text not null,
  station_name    text,
  financial_year  text,
  column_name     text,
  observed_value  text,
  expected_value  text,
  message         text not null,
  created_at      timestamptz not null default now()
);

comment on table validation_warnings is 'Anomalies detected during ingestion. The original source value is preserved in observed_value; the loaded record is never modified to make a warning go away.';

create index if not exists validation_warnings_run_idx on validation_warnings (ingest_run_id);
create index if not exists validation_warnings_check_idx on validation_warnings (check_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists police_stations_set_updated_at on police_stations;
create trigger police_stations_set_updated_at
  before update on police_stations
  for each row execute function set_updated_at();

drop trigger if exists crime_records_set_updated_at on crime_records;
create trigger crime_records_set_updated_at
  before update on crime_records
  for each row execute function set_updated_at();

drop trigger if exists data_sources_set_updated_at on data_sources;
create trigger data_sources_set_updated_at
  before update on data_sources
  for each row execute function set_updated_at();
