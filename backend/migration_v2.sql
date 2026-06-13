-- ============================================================
-- CityRunner — Migration v2: Real-Time Loop Detection
-- Idempotent: safe to run multiple times (IF NOT EXISTS throughout)
-- Run after migration.sql (which added last_lat/lng columns)
-- ============================================================

-- 1. Ensure territories table exists (may have been created elsewhere).
--    If it already exists this is a no-op.
CREATE TABLE IF NOT EXISTS territories (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  polygon        GEOMETRY(POLYGON, 4326) NOT NULL,
  area_sq_meters DOUBLE PRECISION NOT NULL,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_territories_user_id
  ON territories(user_id);
CREATE INDEX IF NOT EXISTS idx_territories_polygon_gist
  ON territories USING GIST(polygon);

-- 2. run_segments — one row per GPS segment (P[n-1] → P[n]).
--    The GIST index lets PostGIS use the R-tree for bounding-box
--    pre-filtering before doing the exact ST_Intersects check.
CREATE TABLE IF NOT EXISTS run_segments (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id   UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq_from INT  NOT NULL,
  seq_to   INT  NOT NULL,
  geom     GEOMETRY(LINESTRING, 4326) NOT NULL
);
-- Composite index for "all segments of a run ordered by seq_to"
CREATE INDEX IF NOT EXISTS idx_run_segments_run_seq
  ON run_segments(run_id, seq_to);
-- Spatial index for intersection queries
CREATE INDEX IF NOT EXISTS idx_run_segments_geom
  ON run_segments USING GIST(geom);

-- 3. detected_loops — every loop found during an active run.
--    territory_id links to the territory that was immediately created.
CREATE TABLE IF NOT EXISTS detected_loops (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id       UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  polygon      GEOMETRY(POLYGON, 4326) NOT NULL,
  area_m2      DOUBLE PRECISION NOT NULL,
  perimeter_m  DOUBLE PRECISION,
  confidence   INT  NOT NULL DEFAULT 0,
  territory_id UUID REFERENCES territories(id) ON DELETE SET NULL,
  detected_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_detected_loops_run_id
  ON detected_loops(run_id);
CREATE INDEX IF NOT EXISTS idx_detected_loops_user_id
  ON detected_loops(user_id, detected_at);
-- Spatial index for the anti-farming overlap check
CREATE INDEX IF NOT EXISTS idx_detected_loops_polygon_gist
  ON detected_loops USING GIST(polygon);
