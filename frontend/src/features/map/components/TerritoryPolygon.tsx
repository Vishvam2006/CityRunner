import { Polygon } from "@react-google-maps/api";

import type { Coordinate } from "../types/map.types";

interface TerritoryPolygonProps {
  points: Coordinate[];
}

export default function TerritoryPolygon({ points }: TerritoryPolygonProps) {
  return (
    <Polygon
      paths={points}
      options={{
        fillColor: "#2563eb",
        fillOpacity: 0.35,
        strokeColor: "#1d4ed8",
        strokeWeight: 3,
      }}
    />
  );
}
