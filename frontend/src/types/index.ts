export interface User {
  userId: string;
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  token: string;
}

export interface UserResponse {
  user: User;
}

export interface LoginPayload {
  email: string;
  password?: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password?: string;
}

export interface Run {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  distance_km: number | null;
}

export interface GpsPoint {
  id?: string;
  run_id?: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  sequence_number?: number;
  recorded_at?: string;
  client_timestamp?: string;
}

// ── Real-time loop detection ───────────────────────────────────────────────────

/**
 * A loop detected in real-time during savePoint.
 * Returned by POST /runs/:runId/points inside `loopDetected`.
 * Also used in GET /runs/:runId/loops (recovery) and in FinishRunResponse.
 */
export interface RealtimeLoop {
  loopId: string;
  territoryId: string;
  /** True polygon WKT built from actual GPS path (not convex hull). */
  polygonWkt: string;
  /** Pre-parsed {lat,lng} array for direct use with React Google Maps. */
  polygonCoords: Array<{ lat: number; lng: number }>;
  area_m2: number;
  perimeter_m: number;
  /** 0–100 confidence score. */
  confidence: number;
  /** ISO timestamp when the loop was detected. */
  detected_at?: string;
}

/** Response from POST /runs/:runId/points */
export interface SavePointResponse {
  point: GpsPoint;
  loopDetected: RealtimeLoop | null;
}

/** Response from POST /runs/:runId/finish */
export interface FinishRunResponse {
  run: Run;
  totalPoints: number;
  distanceKm: number;
  status: string;
  fraudScore?: number;
  /** Number of loops captured during the run. */
  loopsDetected: number;
  /** Full loop details for the summary screen. */
  loops: RealtimeLoop[];
}

/** Response from GET /runs/:runId/loops */
export interface RunLoopsResponse {
  runId: string;
  loops: RealtimeLoop[];
}

export interface LeaderboardResponse {
  data: LeaderboardUser[];
  meta: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
}

export interface LeaderboardUser {
  userId: string;
  username: string;
  distance: number;
  loops: number;
  runs: number;
  rank: number;
}

