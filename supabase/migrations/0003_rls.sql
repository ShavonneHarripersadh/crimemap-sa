-- CrimeMap SA - Row Level Security
--
-- The crime data itself is public information distributed under CC-BY, so it is readable by the
-- anonymous role. Ingestion bookkeeping is not: ingest_runs and validation_warnings are readable
-- only by the service role, which never reaches the browser.
--
-- Views are set to security_invoker so that the caller's RLS applies rather than the view
-- owner's privileges.

alter table police_stations     enable row level security;
alter table crime_records       enable row level security;
alter table data_sources        enable row level security;
alter table ingest_runs         enable row level security;
alter table validation_warnings enable row level security;

-- Public, read-only access to the published data ----------------------------

drop policy if exists police_stations_public_read on police_stations;
create policy police_stations_public_read
  on police_stations for select
  to anon, authenticated
  using (true);

drop policy if exists crime_records_public_read on crime_records;
create policy crime_records_public_read
  on crime_records for select
  to anon, authenticated
  using (true);

drop policy if exists data_sources_public_read on data_sources;
create policy data_sources_public_read
  on data_sources for select
  to anon, authenticated
  using (true);

-- ingest_runs and validation_warnings intentionally have NO policy for anon or
-- authenticated. With RLS enabled and no permissive policy, those roles can read nothing.
-- The service role bypasses RLS and is used only by the pipeline and the protected admin route.

alter view crime_record_totals set (security_invoker = on);
alter view crime_metrics       set (security_invoker = on);

grant select on crime_record_totals to anon, authenticated;
grant select on crime_metrics       to anon, authenticated;

revoke all on ingest_runs         from anon;
revoke all on validation_warnings from anon;

grant execute on function latest_financial_year()                                                     to anon, authenticated;
grant execute on function search_locations(text, integer)                                             to anon, authenticated;
grant execute on function stations_in_bbox(double precision, double precision, double precision, double precision, text, text, integer) to anon, authenticated;
