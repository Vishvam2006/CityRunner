import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GpsPoint } from "../types";

interface RunState {
  currentRunId: string | null;
  isTracking: boolean;
  routePoints: GpsPoint[];
  startTracking: (runId: string) => void;
  stopTracking: () => void;
  addRoutePoint: (point: GpsPoint) => void;
  resetRun: () => void;
}

export const useRunStore = create<RunState>()(
  persist(
    (set) => ({
      currentRunId: null,
      isTracking: false,
      routePoints: [],
      startTracking: (runId) => set({ currentRunId: runId, isTracking: true, routePoints: [] }),
      stopTracking: () => set({ isTracking: false }),
      addRoutePoint: (point) => set((state) => ({ routePoints: [...state.routePoints, point] })),
      resetRun: () => set({ currentRunId: null, isTracking: false, routePoints: [] }),
    }),
    {
      name: "cityrunner-active-run",
    }
  )
);
