import { useEffect, useRef, useState } from "react";
import type { Coordinate } from "../types/map.types";

export default function useCurrentLocation() {
  const [location, setLocation] = useState<Coordinate | null>(null);

  const [routePoints, setRoutePoints] = useState<Coordinate[]>([]);

  const lastSavedRef = useRef(0);

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        // Update marker immediately
        setLocation(point);

        const now = Date.now();

        // Save route point every 3 seconds
        if (now - lastSavedRef.current >= 3000) {
          setRoutePoints((prev) => [...prev, point]);

          lastSavedRef.current = now;
        }
      },
      (error) => {
        console.error(error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return {
    location,
    routePoints,
  };
}
