-- ============================================================
-- CityRunner — Loop Detection Migration
-- Run once against your existing database.
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS).
-- ============================================================

-- 1. Add last-point columns to runs so savePoint can do O(1) anti-cheat
--    lookups instead of fetching all prior GPS points every time.
ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS last_lat               DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_lng               DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_client_ts         TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_server_received_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_accuracy          DOUBLE PRECISION;

-- 2. Index for sequence-ordered GPS queries (fixes ORDER BY recorded_at bug).
--    The composite index (run_id, sequence_number) is used by:
--      - getRunPoints  (ORDER BY sequence_number ASC)
--      - getLastRunPoint (ORDER BY sequence_number DESC LIMIT 1)
CREATE INDEX IF NOT EXISTS idx_gps_points_run_id_seq
  ON gps_points(run_id, sequence_number);

-- 3. GiST index on territory polygons (speeds up ST_Intersects in overlap check).
--    Run this after the territories table has been created if it doesn't exist yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'territories'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_territories_polygon_gist ON territories USING GIST(polygon)';
  END IF;
END
$$;
