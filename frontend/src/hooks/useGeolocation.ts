import { useEffect, useRef, useState } from "react";
import { useRunStore } from "../store/run.store";
import { useSavePoint } from "./queries/useRuns";

export type GpsStatus = "idle" | "locating" | "active" | "error";

export interface GpsError {
  code: number;
  message: string;
}

export function useGeolocation() {
  const { isTracking, currentRunId, addRoutePoint } = useRunStore();
  const { mutate: savePoint } = useSavePoint();
  const lastSavedRef = useRef(0);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [gpsError, setGpsError] = useState<GpsError | null>(null);

  useEffect(() => {
    let watchId: number;

    if (isTracking && currentRunId) {
      setGpsStatus("locating");
      setGpsError(null);

      if (!navigator.geolocation) {
        setGpsStatus("error");
        setGpsError({ code: 0, message: "Geolocation is not supported by your browser." });
        return;
      }

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setGpsStatus("active");
          setGpsError(null);

          const point = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
          };

          // Add locally immediately for smooth UI
          addRoutePoint(point);

          // Save to backend every 3 seconds
          const now = Date.now();
          if (now - lastSavedRef.current >= 3000) {
            savePoint({ runId: currentRunId, point });
            lastSavedRef.current = now;
          }
        },
        (error) => {
          setGpsStatus("error");

          const messages: Record<number, string> = {
            1: "Location permission denied. Please allow location access in your browser settings and reload.",
            2: "Position unavailable. Make sure location services are enabled on your device.",
            3: "Location request timed out. Move to an area with better signal.",
          };

          setGpsError({
            code: error.code,
            message: messages[error.code] || "An unknown GPS error occurred.",
          });
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        }
      );
    } else {
      setGpsStatus("idle");
    }

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isTracking, currentRunId, addRoutePoint, savePoint]);

  return { gpsStatus, gpsError };
}
