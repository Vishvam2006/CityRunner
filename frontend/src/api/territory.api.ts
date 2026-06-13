import { apiClient } from "./client";
import { TerritoryLoopResponse } from "../types";

export const territoryApi = {
  checkLoop: async (runId: string): Promise<TerritoryLoopResponse> => {
    const res = await apiClient.get<TerritoryLoopResponse>(`/territory/loop/${runId}`);
    return res.data;
  },

  createTerritory: async (polygonWkt: string, area: number): Promise<void> => {
    await apiClient.post("/territory", { polygonWkt, area });
  },

  getTerritories: async (): Promise<any[]> => {
    const res = await apiClient.get<any[]>("/territory");
    return res.data;
  },
};

