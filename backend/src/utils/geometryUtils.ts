/**
 * geometryUtils.ts
 *
 * Pure TypeScript computational geometry for CityRunner loop detection.
 * Zero external dependencies — everything here is unit-testable without
 * a database or PostGIS.
 *
 * PostGIS is still used for the authoritative area/perimeter calculation
 * and for ST_MakeValid polygon repair, but the intersection test and
 * ring construction live here so they can be exercised in fast unit tests.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Point2D {
  lat: number;
  lng: number;
}

export interface LoopCandidate {
  /** Index of the older segment's end point (j in the plan). */
  oldSegEndIdx: number;
  /** Intersection point in geographic coordinates. */
  intersection: Point2D;
  /** Estimated area in m² (shoelace approximation — for testing only). */
  estimatedAreaM2: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Skip this many trailing segments before checking for intersections.
 *  Prevents GPS zigzag from triggering false loops.
 *  At 8 m/segment → 64 m minimum path before detection starts. */
export const MIN_SKIP_SEGMENTS = 8;

/** Reject loops whose PostGIS-computed area is below this threshold. */
export const MIN_LOOP_AREA_M2 = 50;

/** Minimum GPS segment length (metres).
 *  Segments shorter than this are stationary noise and are skipped. */
export const MIN_SEGMENT_LENGTH_M = 2;

// ── Haversine Distance ────────────────────────────────────────────────────────

/**
 * Haversine great-circle distance in **metres**.
 * Accurate to within ~0.3% for distances up to ~1 000 km.
 */
export function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R    = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Segment Intersection ──────────────────────────────────────────────────────

/**
 * Parametric 2-D line segment intersection.
 *
 * Solves: A + t(B−A) = C + s(D−C) for t ∈ [0,1], s ∈ [0,1].
 *
 * Treats lat/lng as planar coordinates — accurate for short segments
 * (< 50 km) away from the poles. Sufficient for city-scale running.
 *
 * Returns the intersection point in geographic coordinates, or null if
 * the segments do not cross (parallel, collinear, or non-overlapping).
 */
export function segmentIntersection(
  A: Point2D, B: Point2D,
  C: Point2D, D: Point2D
): Point2D | null {
  const dx1 = B.lng - A.lng;
  const dy1 = B.lat - A.lat;
  const dx2 = D.lng - C.lng;
  const dy2 = D.lat - C.lat;

  // Cross product of direction vectors (2D determinant)
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-12) return null; // parallel or collinear

  const ex = C.lng - A.lng;
  const ey = C.lat - A.lat;

  const t = (ex * dy2 - ey * dx2) / denom;
  const s = (ex * dy1 - ey * dx1) / denom;

  if (t >= 0 && t <= 1 && s >= 0 && s <= 1) {
    return {
      lat: A.lat + t * dy1,
      lng: A.lng + t * dx1,
    };
  }
  return null;
}

// ── WKT Builders / Parsers ────────────────────────────────────────────────────

/**
 * Builds a closed POLYGON WKT ring from an intersection point and the
 * interior GPS path that forms the loop body.
 *
 * Ring layout: P_int → gpsPoints[0] → ... → gpsPoints[N-1] → P_int
 *
 * PostGIS expects coordinates as (longitude latitude) — X before Y.
 */
export function buildRingWkt(
  intersection: Point2D,
  gpsPoints: ReadonlyArray<{ latitude: number; longitude: number }>
): string {
  const close = `${intersection.lng} ${intersection.lat}`;
  const interior = gpsPoints
    .map(p => `${p.longitude} ${p.latitude}`)
    .join(', ');
  return `POLYGON((${close}, ${interior}, ${close}))`;
}

/**
 * Parses a PostGIS POINT WKT string into a Point2D.
 *
 * Handles:
 *  - POINT(lng lat)
 *  - POINT (lng lat)          (extra space)
 *  - MULTIPOINT((lng lat)…)  (takes first component)
 *
 * Returns null for LINESTRING / other geometry types (collinear segments —
 * not a real crossing).
 */
export function parseIntersectionPoint(wkt: string): Point2D | null {
  // Standard POINT
  const pointMatch = wkt.match(/^POINT\s*\(\s*([^\s)]+)\s+([^\s)]+)\s*\)$/i);
  if (pointMatch) {
    const lng = parseFloat(pointMatch[1]);
    const lat = parseFloat(pointMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  // MULTIPOINT — take the first coordinate pair
  // Handles: MULTIPOINT(lng lat, lng lat) or MULTIPOINT((lng lat), (lng lat))
  const multiMatch = wkt.match(/MULTIPOINT\s*\(?\s*\(?\s*([^\s,)]+)\s+([^\s,)]+)/i);
  if (multiMatch) {
    const lng = parseFloat(multiMatch[1]);
    const lat = parseFloat(multiMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  // LINESTRING or empty — collinear segments, not a real crossing
  return null;
}

/**
 * Parses a PostGIS POLYGON WKT string into an array of {lat, lng} points
 * suitable for Google Maps / React Google Maps rendering.
 *
 * Only processes the exterior ring (ignores holes).
 * PostGIS WKT format: POLYGON((lng lat, lng lat, …))
 */
export function wktPolygonToCoords(wkt: string): Array<{ lat: number; lng: number }> {
  // Extract exterior ring content (between the first `((` and the next `)`)
  const match = wkt.match(/POLYGON\s*\(\(([^)]+)\)/i);
  if (!match) return [];

  return match[1]
    .split(',')
    .map(pair => {
      const parts = pair.trim().split(/\s+/);
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      return { lat, lng };
    })
    .filter(c => !isNaN(c.lat) && !isNaN(c.lng));
}

// ── In-Memory Loop Detection (for tests — no PostGIS) ────────────────────────

/**
 * Shoelace-formula polygon area in m².
 *
 * Projects to local Cartesian using the centroid latitude.
 * Accurate to ~1% for polygons up to ~10 km across — sufficient for tests.
 */
export function shoelaceAreaM2(ring: Point2D[]): number {
  if (ring.length < 3) return 0;

  const centerLat = ring.reduce((s, p) => s + p.lat, 0) / ring.length;
  const LAT_TO_M  = 111_320;
  const LNG_TO_M  = 111_320 * Math.cos(centerLat * Math.PI / 180);

  let area = 0;
  const n  = ring.length;
  for (let i = 0; i < n - 1; i++) {
    const x1 = ring[i].lng     * LNG_TO_M;
    const y1 = ring[i].lat     * LAT_TO_M;
    const x2 = ring[i + 1].lng * LNG_TO_M;
    const y2 = ring[i + 1].lat * LAT_TO_M;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

/**
 * Detects ALL loops in a GPS point sequence using segment-intersection
 * geometry.  Suitable for tests and offline analysis; production code
 * uses PostGIS via loop.repository.ts.
 *
 * Algorithm:
 *   For each new segment S_i (points[i-1] → points[i]):
 *     Check S_i against all prior segments S_j where j ≤ i−1−minSkip.
 *     Iterate j from recent→old (finds smallest loop first).
 *     On first intersection: record loop, break inner loop, continue outer.
 *
 * @param points     Ordered GPS points (lat/lng)
 * @param minSkip    Number of trailing segments to skip (noise guard)
 * @param minAreaM2  Minimum enclosed area to count as a valid loop
 */
export function detectAllLoops(
  points: Point2D[],
  minSkip: number = MIN_SKIP_SEGMENTS,
  minAreaM2: number = MIN_LOOP_AREA_M2
): LoopCandidate[] {
  const loops: LoopCandidate[] = [];

  for (let i = 1; i < points.length; i++) {
    const newA = points[i - 1];
    const newB = points[i];

    // Check from most-recent eligible segment backwards (smallest loop first)
    const jMax = i - 1 - minSkip;
    for (let j = jMax; j >= 1; j--) {
      const oldA = points[j - 1];
      const oldB = points[j];

      const ix = segmentIntersection(oldA, oldB, newA, newB);
      if (!ix) continue;

      // Loop ring: ix → points[j] → ... → points[i-1] → ix
      const ring: Point2D[] = [
        ix,
        ...points.slice(j, i), // points[j] through points[i-1]
        ix,
      ];

      const area = shoelaceAreaM2(ring);
      if (area >= minAreaM2) {
        loops.push({
          oldSegEndIdx: j,
          intersection: ix,
          estimatedAreaM2: area,
        });
      }
      break; // take the smallest (most recent) loop for this segment
    }
  }

  return loops;
}

// ── Synthetic GPS generators (exported for test use) ─────────────────────────

/** Generate a perfect circle of evenly-spaced GPS points. */
export function generateCircle(
  centerLat: number,
  centerLng: number,
  radiusM: number,
  numPoints: number,
  startAngle = 0
): Point2D[] {
  const LAT_DEG_PER_M = 1 / 111_320;
  const LNG_DEG_PER_M = 1 / (111_320 * Math.cos(centerLat * Math.PI / 180));

  return Array.from({ length: numPoints }, (_, i) => {
    const angle = startAngle + (2 * Math.PI * i) / numPoints;
    return {
      lat: centerLat + radiusM * Math.sin(angle) * LAT_DEG_PER_M,
      lng: centerLng + radiusM * Math.cos(angle) * LNG_DEG_PER_M,
    };
  });
}

/** Generate a rectangular loop with points along each side. */
export function generateSquare(
  originLat: number,
  originLng: number,
  sideLenM: number,
  ptsPerSide = 8
): Point2D[] {
  const LAT_DEG_PER_M = 1 / 111_320;
  const LNG_DEG_PER_M = 1 / (111_320 * Math.cos(originLat * Math.PI / 180));
  const dLat = sideLenM * LAT_DEG_PER_M;
  const dLng = sideLenM * LNG_DEG_PER_M;

  const corners: Point2D[] = [
    { lat: originLat,        lng: originLng },
    { lat: originLat + dLat, lng: originLng },
    { lat: originLat + dLat, lng: originLng + dLng },
    { lat: originLat,        lng: originLng + dLng },
  ];

  const pts: Point2D[] = [];
  for (let c = 0; c < 4; c++) {
    const from = corners[c];
    const to   = corners[(c + 1) % 4];
    for (let p = 0; p < ptsPerSide; p++) {
      const t = p / ptsPerSide;
      pts.push({
        lat: from.lat + (to.lat - from.lat) * t,
        lng: from.lng + (to.lng - from.lng) * t,
      });
    }
  }
  return pts;
}

/** Generate an oval (ellipse) GPS path. */
export function generateOval(
  centerLat: number,
  centerLng: number,
  radiusAM: number, // semi-axis along latitude
  radiusBM: number, // semi-axis along longitude
  numPoints: number
): Point2D[] {
  const LAT_DEG_PER_M = 1 / 111_320;
  const LNG_DEG_PER_M = 1 / (111_320 * Math.cos(centerLat * Math.PI / 180));

  return Array.from({ length: numPoints }, (_, i) => {
    const angle = (2 * Math.PI * i) / numPoints;
    return {
      lat: centerLat + radiusAM * Math.sin(angle) * LAT_DEG_PER_M,
      lng: centerLng + radiusBM * Math.cos(angle) * LNG_DEG_PER_M,
    };
  });
}

/** Generate a figure-8 path (two tangent circles, shared crossing point). */
export function generateFigureEight(
  centerLat: number,
  centerLng: number,
  radiusM: number,
  ptsPerLoop: number
): Point2D[] {
  const LAT_DEG_PER_M = 1 / 111_320;
  const LNG_DEG_PER_M = 1 / (111_320 * Math.cos(centerLat * Math.PI / 180));
  const offset = radiusM * LNG_DEG_PER_M;

  const leftCircle  = generateCircle(centerLat, centerLng - offset, radiusM, ptsPerLoop);
  const rightCircle = generateCircle(centerLat, centerLng + offset, radiusM, ptsPerLoop, Math.PI);

  return [...leftCircle, ...rightCircle];
}

/** Add Gaussian noise (in metres) to simulate GPS inaccuracy. */
export function addNoise(points: Point2D[], noiseM: number): Point2D[] {
  const LAT_DEG_PER_M = 1 / 111_320;
  const LNG_DEG_PER_M = 1 / (111_320 * Math.cos((points[0]?.lat ?? 0) * Math.PI / 180));

  // Approximate Gaussian with sum of uniforms (CLT, 6 samples)
  const gaussian = () => {
    let s = 0;
    for (let i = 0; i < 6; i++) s += Math.random() - 0.5;
    return s * Math.sqrt(2 / 6); // normalize to σ≈1
  };

  return points.map(p => ({
    lat: p.lat + gaussian() * noiseM * LAT_DEG_PER_M,
    lng: p.lng + gaussian() * noiseM * LNG_DEG_PER_M,
  }));
}

/** Generate a straight line (should never produce a loop). */
export function generateStraightLine(
  startLat: number,
  startLng: number,
  lengthM: number,
  numPoints: number
): Point2D[] {
  const LAT_DEG_PER_M = 1 / 111_320;
  return Array.from({ length: numPoints }, (_, i) => ({
    lat: startLat + (i / (numPoints - 1)) * lengthM * LAT_DEG_PER_M,
    lng: startLng,
  }));
}

/** Generate a path that crosses the same road multiple times (zigzag). */
export function generateZigzag(
  startLat: number,
  startLng: number,
  amplitudeM: number,
  stepM: number,
  numSteps: number
): Point2D[] {
  const LAT_DEG_PER_M = 1 / 111_320;
  const LNG_DEG_PER_M = 1 / (111_320 * Math.cos(startLat * Math.PI / 180));

  return Array.from({ length: numSteps }, (_, i) => ({
    lat: startLat + i * stepM * LAT_DEG_PER_M,
    lng: startLng + (i % 2 === 0 ? amplitudeM : -amplitudeM) * LNG_DEG_PER_M,
  }));
}
