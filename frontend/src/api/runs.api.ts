import { apiClient } from "./client";
import {
  Run,
  GpsPoint,
  SavePointResponse,
  FinishRunResponse,
  RunLoopsResponse,
} from "../types";

export type SavePointPayload = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  sequence_number: number;
  client_timestamp: string;
};

export const runsApi = {
  start: async (): Promise<Run> => {
    const res = await apiClient.post<Run>("/runs/start");
    return res.data;
  },
  savePoint: async (runId: string, point: SavePointPayload): Promise<SavePointResponse> => {
    const res = await apiClient.post<SavePointResponse>(`/runs/${runId}/points`, point);
    return res.data;
  },

  getRun: async (runId: string): Promise<{ runId: string; points: GpsPoint[] }> => {
    const res = await apiClient.get<{ runId: string; points: GpsPoint[] }>(
      `/runs/${runId}`
    );
    return res.data;
  },

  getDistance: async (
    runId: string
  ): Promise<{ runId: string; distanceKm: number }> => {
    const res = await apiClient.get<{ runId: string; distanceKm: number }>(
      `/runs/${runId}/distance`
    );
    return res.data;
  },

  /**
   * Fetches all loops detected during a run.
   * Used for: recovery on page reload, and populating the summary screen.
   */
  getRunLoops: async (runId: string): Promise<RunLoopsResponse> => {
    const res = await apiClient.get<RunLoopsResponse>(`/runs/${runId}/loops`);
    return res.data;
  },

  finish: async (runId: string): Promise<FinishRunResponse> => {
    const res = await apiClient.post<FinishRunResponse>(`/runs/${runId}/finish`);
    return res.data;
  },
};
