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
  recorded_at?: string;
}

export interface FinishRunResponse {
  run: Run;
  totalPoints: number;
  distanceKm: number;
  status: string;
  fraudScore?: number;
}

export interface TerritoryLoopResponse {
  success: boolean;
  loop_detected: boolean;
  gap_m: number | null;
  area_m2: number | null;
  point_count: number;
  reason?: string;
  /** WKT polygon string. Present only when loop_detected === true. */
  polygonWkt?: string | null;
}

export interface LeaderboardUser {
  userId: string;
  username: string;
  distance: number;
  loops: number;
  runs: number;
  rank: number;
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
