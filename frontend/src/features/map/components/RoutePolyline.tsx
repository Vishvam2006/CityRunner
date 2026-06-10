import { Polyline } from "@react-google-maps/api";

import type { Coordinate } from "../types/map.types";

interface RoutePolylineProps {
  points: Coordinate[];
}

export default function RoutePolyline({ points }: RoutePolylineProps) {
  return (
    <Polyline
      path={points}
      options={{
        strokeColor: "#2563eb",
        strokeWeight: 5,
      }}
    />
  );
}
