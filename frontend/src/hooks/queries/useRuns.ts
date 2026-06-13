import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runsApi } from "../../api/runs.api";

export const useStartRun = () => {
  return useMutation({
    mutationFn: runsApi.start,
  });
};

export const useSavePoint = () => {
  return useMutation({
    mutationFn: ({
      runId,
      point,
    }: {
      runId: string;
      point: {
        latitude: number;
        longitude: number;
        accuracy?: number | null;
        speed?: number | null;
        sequence_number: number;
        client_timestamp: string;
      };
    }) => runsApi.savePoint(runId, point),
  });
};

export const useFinishRun = () => {
  return useMutation({
    mutationFn: runsApi.finish,
  });
};

/**
 * Fetches all loops detected during a run.
 * Used for recovery when the user reloads the page mid-run:
 *   const { data } = useGetRunLoops(currentRunId);
 *   // data.loops restores the territory polygons on the map
 */
export const useGetRunLoops = (runId: string | null) => {
  return useQuery({
    queryKey: ["runLoops", runId],
    queryFn:  () => runsApi.getRunLoops(runId!),
    enabled:  !!runId,
    staleTime: Infinity, // loops don't change once detected
    retry:    false,
  });
};

/**
 * Invalidates the territory map cache when called.
 * The territory list on the city map will refetch automatically.
 */
export const useCreateTerritory = () => {
  const queryClient = useQueryClient();

  return {
    invalidateTerritories: () => {
      queryClient.invalidateQueries({ queryKey: ["territories"] });
    },
  };
};
