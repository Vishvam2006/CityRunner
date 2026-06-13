import { useEffect, useRef, useState } from "react";
import { useRunStore } from "../store/run.store";
import { useSavePoint } from "./queries/useRuns";
import toast from "react-hot-toast";

export type GpsStatus = "idle" | "locating" | "active" | "error";

export interface GpsError {
  code: number;
  message: string;
}

// ── GPS quality thresholds ────────────────────────────────────────────────────

/** Reject fixes worse than this (metres).  iOS/Android rarely exceed 30 m
 *  with a good fix; 50 m is a generous cut-off that still filters cell-tower
 *  and WiFi positioning fallbacks. */
const MAX_ACCEPTABLE_ACCURACY_M = 50;

/** Save to backend when the runner has moved at least this far since the
 *  last saved point.  Provides geometry density guarantees independent of
 *  running speed, and avoids saving duplicate coordinates when stationary. */
const MIN_SAVE_DISTANCE_M = 8;

/** Fallback: always save if this many ms have passed, even without movement. */
const MAX_SAVE_INTERVAL_MS = 5000;

/** Client-side speed ceiling for outlier rejection (m/s).
 *  Usain Bolt peak: 10.44 m/s.  We allow 12 to accommodate downhills / GPS
 *  burst, but reject anything beyond that as a sensor glitch. */
const MAX_PLAUSIBLE_SPEED_MPS = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineM(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R    = 6_371_000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGeolocation() {
  const { isTracking, currentRunId, addRoutePoint, addDetectedLoop } = useRunStore();
  const { mutate: savePoint } = useSavePoint();
  const sequenceNumberRef = useRef(0);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [gpsError,  setGpsError]  = useState<GpsError | null>(null);

  // ── Stable refs for callbacks used inside watchPosition ──────────────────
  // Storing mutable functions in refs prevents the useEffect from re-running
  // (and restarting the GPS watcher) on every render.  Previously the dep
  // array included `addRoutePoint` and `savePoint` which are new references
  // every render, causing the watcher to restart constantly and drop points.
  const addRoutePointRef = useRef(addRoutePoint);
  const addDetectedLoopRef = useRef(addDetectedLoop);
  const savePointRef = useRef(savePoint);

  useEffect(() => {
    addRoutePointRef.current = addRoutePoint;
  }, [addRoutePoint]);

  useEffect(() => {
    addDetectedLoopRef.current = addDetectedLoop;
  }, [addDetectedLoop]);

  useEffect(() => {
    savePointRef.current = savePoint;
  }, [savePoint]);

  // Tracking state that must persist across watchPosition callbacks
  const lastSavedMsRef       = useRef(0);
  const lastSavedPosRef      = useRef<{ latitude: number; longitude: number } | null>(null);

  // Reset per-run state when a new run starts
  useEffect(() => {
    // Reset sequence number when a new run starts tracking
    sequenceNumberRef.current = 0;
  }, [currentRunId]);

  // ── GPS watcher ───────────────────────────────────────────────────────────
  // Deps: only `isTracking` and `currentRunId`.  Callbacks are accessed via
  // refs, so watcher is never torn down / recreated by render cycles.
  useEffect(() => {
    let watchId: number;

    if (!isTracking || !currentRunId) {
      setGpsStatus("idle");
      return;
    }

    setGpsStatus("locating");
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsStatus("error");
      setGpsError({ code: 0, message: "Geolocation is not supported by your browser." });
      return;
    }

    const runId = currentRunId; // Capture for closure

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        const speed = position.coords.speed;

        setGpsStatus("active");
        setGpsError(null);

        // 1. Accuracy gate: ignore low-quality fixes.
        if (accuracy != null && accuracy > MAX_ACCEPTABLE_ACCURACY_M) {
          return;
        }

        // 2. Plausible speed gate: ignore sensor spikes.
        if (speed != null && speed > MAX_PLAUSIBLE_SPEED_MPS) {
          return;
        }

        // ── Always add to in-memory store for smooth UI ──────────────────
        const point = {
          latitude,
          longitude,
          accuracy,
          speed,
          sequence_number: sequenceNumberRef.current + 1,
          client_timestamp: new Date(now).toISOString(),
        };
        addRoutePointRef.current(point);

        const lastSavedPos = lastSavedPosRef.current;
        const distM = lastSavedPos
          ? haversineM(
              lastSavedPos.latitude,
              lastSavedPos.longitude,
              latitude,
              longitude
            )
          : Infinity;

        // 3. Distance / time gate: only save when runner has moved
        //    meaningfully OR enough time has elapsed
        const movedEnough    = distM >= MIN_SAVE_DISTANCE_M;
        const timeoutElapsed = (now - lastSavedMsRef.current) >= MAX_SAVE_INTERVAL_MS;

        if (!movedEnough && !timeoutElapsed) {
          return; // deduplicate stationary noise
        }

        // ── Save to backend ───────────────────────────────────────────────
        sequenceNumberRef.current += 1;

        const backendPoint = {
          latitude,
          longitude,
          accuracy,
          speed,
          sequence_number:  sequenceNumberRef.current,
          client_timestamp: new Date(now).toISOString(),
        };

        savePointRef.current(
          { runId, point: backendPoint },
          {
            onSuccess: (data) => {
              if (data.loopDetected) {
                addDetectedLoopRef.current(data.loopDetected);
                toast.success(`Territory Captured! (${Math.round(data.loopDetected.area_m2)} m²)`, {
                  icon: "⛳️",
                  duration: 4000,
                  position: "top-center",
                });
              }
            },
          }
        );

        lastSavedMsRef.current  = now;
        lastSavedPosRef.current = { latitude, longitude };
      },
      (error) => {
        setGpsStatus("error");

        const messages: Record<number, string> = {
          1: "Location permission denied. Please allow location access in your browser settings and reload.",
          2: "Position unavailable. Make sure location services are enabled on your device.",
          3: "Location request timed out. Move to an area with better GPS signal.",
        };

        setGpsError({
          code:    error.code,
          message: messages[error.code] ?? "An unknown GPS error occurred.",
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge:         0,
        timeout:            15_000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isTracking, currentRunId]); // Stable deps — watcher never restarts mid-run

  return { gpsStatus, gpsError };
}
