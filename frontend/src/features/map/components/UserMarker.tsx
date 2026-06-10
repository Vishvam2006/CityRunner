import { MarkerF } from "@react-google-maps/api";

import type { Coordinate } from "../types/map.types";

interface UserMarkerProps {
  position: Coordinate;
}

export default function UserMarker({ position }: UserMarkerProps) {
  return <MarkerF position={position} />;
}
