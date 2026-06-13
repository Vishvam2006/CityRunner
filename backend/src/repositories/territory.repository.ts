import { pool } from "../db/postgres";

const LOOP_CLOSE_THRESHOLD_M = 30;

export async function createTerritoryRepo(
  userId: string,
  polygonWkt: string,
  area: number,
) {
  const result = await pool.query(
    `
    INSERT INTO territories
    (
      user_id,
      polygon,
      area_sq_meters
    )
    VALUES
    (
      $1,
      ST_GeomFromText($2, 4326),
      $3
    )
    RETURNING *
    `,
    [userId, polygonWkt, area],
  );

  return result.rows[0];
}

export async function getTerritories() {
  const result = await pool.query(
    `
    SELECT
      t.id,
      t.user_id,
      t.area_sq_meters,
      ST_AsGeoJSON(t.polygon) AS polygon
    FROM territories t
    `,
  );

  return result.rows.map((territory) => ({
    ...territory,
    polygon: JSON.parse(territory.polygon),
  }));
}

export async function detectLoopForRun(
  runId: string,
  userId: string,
  points: any[],
) {
  if (points.length < 10) {
    return {
      success: true,
      loop_detected: false,
      reason: `Not enough points (${points.length}/10)`,
      area_m2: null,
      gap_m: null,
    };
  }

  const wktPoints = points
    .map(
      (p: { latitude: number; longitude: number }) =>
        `${p.longitude} ${p.latitude}`,
    )
    .join(", ");

  const query = `
    WITH
      path AS (
        SELECT ST_GeomFromText(
          'LINESTRING(${wktPoints})',
          4326
        ) AS geom
      ),

      endpoints AS (
        SELECT
          ST_StartPoint(geom) AS start_pt,
          ST_EndPoint(geom) AS end_pt,
          geom
        FROM path
      ),

      detection AS (
        SELECT
          ST_Distance(
            ST_Transform(start_pt, 3857),
            ST_Transform(end_pt, 3857)
          ) AS gap_m,
          geom,
          start_pt
        FROM endpoints
      ),

      polygon_cte AS (
        SELECT
          gap_m,
          gap_m <= $1 AS is_closed,

          CASE
            WHEN gap_m <= $1
            THEN ST_MakePolygon(
              ST_AddPoint(
                geom,
                start_pt
              )
            )
            ELSE NULL
          END AS poly_geom,

          CASE
            WHEN gap_m <= $1
            THEN ST_Area(
              ST_MakePolygon(
                ST_AddPoint(
                  geom,
                  start_pt
                )
              )::geography
            )
            ELSE NULL
          END AS area_m2,

          CASE
            WHEN gap_m <= $1
            THEN ST_Length(
              geom::geography
            )
            ELSE NULL
          END AS perimeter_m

        FROM detection
      ),

      recent_runs AS (
        SELECT id
        FROM runs
        WHERE user_id = $2
          AND id != $3
          AND started_at >= NOW() - INTERVAL '24 hours'
          AND status = 'VALID'
      ),

      recent_points AS (
        SELECT
          r.id AS run_id,
          gp.longitude,
          gp.latitude,
          gp.recorded_at
        FROM recent_runs r
        JOIN gps_points gp
          ON gp.run_id = r.id
        ORDER BY r.id, gp.recorded_at
      ),

      recent_lines AS (
        SELECT
          run_id,
          ST_MakeLine(
            ST_SetSRID(
              ST_MakePoint(
                longitude,
                latitude
              ),
              4326
            )
            ORDER BY recorded_at
          ) AS geom
        FROM recent_points
        GROUP BY run_id
        HAVING COUNT(*) >= 10
      ),

      recent_polys AS (
        SELECT
          run_id,

          ST_MakePolygon(
            ST_AddPoint(
              geom,
              ST_StartPoint(geom)
            )
          ) AS poly_geom,

          ST_Area(
            ST_MakePolygon(
              ST_AddPoint(
                geom,
                ST_StartPoint(geom)
              )
            )::geography
          ) AS poly_area

        FROM recent_lines

        WHERE ST_Distance(
          ST_Transform(
            ST_StartPoint(geom),
            3857
          ),
          ST_Transform(
            ST_EndPoint(geom),
            3857
          )
        ) <= $1
      ),

      overlaps AS (
        SELECT
          MAX(
            ST_Area(
              ST_Intersection(
                p1.poly_geom,
                p2.poly_geom
              )::geography
            ) / p1.area_m2
          ) AS max_overlap_ratio

        FROM polygon_cte p1
        CROSS JOIN recent_polys p2

        WHERE
          p1.is_closed = true
          AND p1.area_m2 > 0
      )

    SELECT
      p.gap_m,
      p.is_closed,
      p.area_m2,
      p.perimeter_m,
      COALESCE(
        o.max_overlap_ratio,
        0
      ) AS max_overlap_ratio
    FROM polygon_cte p
    LEFT JOIN overlaps o
      ON true;
  `;

  const result = await pool.query(query, [
    LOOP_CLOSE_THRESHOLD_M,
    userId,
    runId,
  ]);

  const row = result.rows[0];

  const isClosed = row.is_closed;
  const areaM2 = row.area_m2 !== null ? parseFloat(row.area_m2) : null;

  const perimeterM =
    row.perimeter_m !== null ? parseFloat(row.perimeter_m) : null;

  const maxOverlapRatio = parseFloat(row.max_overlap_ratio);

  let loopDetected = isClosed;

  let reason = "Loop detected successfully";

  if (isClosed && areaM2 !== null && perimeterM !== null) {
    if (areaM2 < 100) {
      loopDetected = false;
      reason = "Loop area too small (< 100 m²)";
    }

    const maxTheoreticalArea = (perimeterM * perimeterM) / (4 * Math.PI);

    if (areaM2 > maxTheoreticalArea * 1.5) {
      loopDetected = false;

      reason =
        "Impossible Area-to-Perimeter ratio (Potential Teleportation/Exploit)";
    }

    if (maxOverlapRatio > 0.8) {
      loopDetected = false;

      reason =
        "Territory Farming: Overlaps > 80% with a recent territory captured in last 24h";
    }
  } else if (!isClosed) {
    reason = "Start and end points are too far apart to close loop";
  }

  return {
    success: true,
    loop_detected: loopDetected,
    gap_m: row.gap_m !== null ? parseFloat(row.gap_m) : null,
    area_m2: loopDetected ? areaM2 : null,
    reason: !loopDetected ? reason : undefined,
  };
}
