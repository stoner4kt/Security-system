-- ============================================================================
-- Sentinel Fleet — GPS retention janitor
--
-- location_logs grows ~15s per ping per vehicle: 5,760 rows/vehicle/day.
-- Keep only the latest 7 days of raw pings (comply with typical retention
-- policies and keep the table small). Run via pg_cron:
--
--   select cron.schedule('gps-retention-daily', '0 3 * * *',
--     $$delete from public.location_logs where recorded_at < now() - interval '7 days'$$);
--
-- If you don't want pg_cron, schedule an equivalent statement from a
-- Supabase dashboard cron or a GitHub Action / scheduled Edge Function.
-- ============================================================================

-- Nothing to migrate by default — documented here so the retention interval is
-- discoverable. To enable simply run the DELETE above on your own schedule.

-- Optional: also purge resolved incidents older than 90 days.
--   delete from public.incidents
--    where status = 'resolved' and created_at < now() - interval '90 days';

-- Optional: ensure the trailing-row count stays index-friendly.
comment on table public.location_logs is
  'Live and historical GPS stream. Retain 7 days of raw pings; aggregate older trails if needed.';