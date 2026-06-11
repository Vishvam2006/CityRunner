import { apiClient } from "./client";
import { TerritoryLoopResponse } from "../types";

export const territoryApi = {
  checkLoop: async (runId: string): Promise<TerritoryLoopResponse> => {
    const res = await apiClient.get<TerritoryLoopResponse>(`/territory/loop/${runId}`);
    return res.data;
  },
};
