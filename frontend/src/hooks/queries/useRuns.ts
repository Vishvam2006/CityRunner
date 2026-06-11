import { useMutation, useQuery } from "@tanstack/react-query";
import { runsApi } from "../../api/runs.api";
import { territoryApi } from "../../api/territory.api";

export const useStartRun = () => {
  return useMutation({
    mutationFn: runsApi.start,
  });
};

export const useSavePoint = () => {
  return useMutation({
    mutationFn: ({ runId, point }: { runId: string; point: { latitude: number; longitude: number; accuracy?: number | null; speed?: number | null } }) =>
      runsApi.savePoint(runId, point),
  });
};

export const useFinishRun = () => {
  return useMutation({
    mutationFn: runsApi.finish,
  });
};

export const useCheckLoop = (runId: string | null) => {
  return useQuery({
    queryKey: ["loop", runId],
    queryFn: () => territoryApi.checkLoop(runId!),
    enabled: !!runId,
    retry: false,
  });
};
