import { pool } from "../db/postgres";
import {
  detectAllLoops,
  Point2D,
} from "../utils/geometryUtils";

export interface LoopDetectionResult {
  success: boolean;
  loop_detected: boolean;
  confidence: number;
  gap_m: number | null;
  area_m2: number | null;
  polygon_wkt: string | null;
  reason?: string;
}

/**
 * Legacy loop detection check, kept for debugging / admin API routes.
 * Rewritten to use the new production-grade offline segment-intersection detection.
 */
export async function detectLoopForRun(
  runId: string,
  userId: string,
  points: { latitude: number; longitude: number; sequence_number?: number }[]
): Promise<LoopDetectionResult> {
  if (points.length < 10) {
    return {
      success: true,
      loop_detected: false,
      confidence: 0,
      gap_m: null,
      area_m2: null,
      polygon_wkt: null,
      reason: `Not enough points (${points.length}/10)`,
    };
  }

  // Convert GPS points to geometry-friendly 2D points (lat/lng)
  const points2d: Point2D[] = points.map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
  }));

  const loops = detectAllLoops(points2d);
  if (loops.length === 0) {
    return {
      success: true,
      loop_detected: false,
      confidence: 0,
      gap_m: null,
      area_m2: null,
      polygon_wkt: null,
      reason: "No path crossings/intersections detected",
    };
  }

  // Return the first detected loop
  const bestLoop = loops[0];
  
  // Reconstruct polygon ring: intersection -> interior points -> intersection
  const ringPoints: Point2D[] = [
    bestLoop.intersection,
    ...points2d.slice(bestLoop.oldSegEndIdx),
    bestLoop.intersection,
  ];
  
  // PostGIS WKT expects longitude (x) first, then latitude (y)
  const ringWkt = `POLYGON((${ringPoints.map((p) => `${p.lng} ${p.lat}`).join(", ")}))`;

  return {
    success: true,
    loop_detected: true,
    confidence: 85,
    gap_m: 0,
    area_m2: bestLoop.estimatedAreaM2,
    polygon_wkt: ringWkt,
  };
}

export async function createTerritoryRepo(
  userId: string,
  polygonWkt: string,
  area: number
) {
  const result = await pool.query(
    `
    INSERT INTO territories (user_id, polygon, area_sq_meters)
    VALUES ($1, ST_GeomFromText($2, 4326), $3)
    RETURNING *
    `,
    [userId, polygonWkt, area]
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
    `
  );
  return result.rows.map((territory) => ({
    ...territory,
    polygon: JSON.parse(territory.polygon),
  }));
}
