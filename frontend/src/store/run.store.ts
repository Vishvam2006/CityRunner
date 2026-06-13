import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GpsPoint, RealtimeLoop } from "../types";

interface RunState {
  currentRunId: string | null;
  isTracking: boolean;
  routePoints: GpsPoint[];
  /** All loops captured in real-time during the current run. */
  detectedLoops: RealtimeLoop[];
  startTracking: (runId: string) => void;
  stopTracking: () => void;
  addRoutePoint: (point: GpsPoint) => void;
  addDetectedLoop: (loop: RealtimeLoop) => void;
  resetRun: () => void;
}

export const useRunStore = create<RunState>()(
  persist(
    (set) => ({
      currentRunId:  null,
      isTracking:    false,
      routePoints:   [],
      detectedLoops: [],

      startTracking: (runId) =>
        set({
          currentRunId:  runId,
          isTracking:    true,
          routePoints:   [],
          detectedLoops: [],  // reset loops when a new run starts
        }),

      stopTracking: () =>
        set({ isTracking: false }),

      addRoutePoint: (point) =>
        set((state) => ({ routePoints: [...state.routePoints, point] })),

      addDetectedLoop: (loop) =>
        set((state) => ({
          detectedLoops: [...state.detectedLoops, loop],
        })),

      resetRun: () =>
        set({
          currentRunId:  null,
          isTracking:    false,
          routePoints:   [],
          detectedLoops: [],
        }),
    }),
    {
      name: "cityrunner-active-run",
    }
  )
);
