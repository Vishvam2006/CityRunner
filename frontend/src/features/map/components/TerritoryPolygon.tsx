import { Polygon } from "@react-google-maps/api";

import { getUserColor } from "../utils/getUserColor";

interface Props {
  coordinates: {
    lat: number;
    lng: number;
  }[];

  userId: string;
}

export default function TerritoryPolygon({ coordinates, userId }: Props) {
  const color = getUserColor(userId);

  return (
    <Polygon
      paths={coordinates}
      options={{
        fillColor: color,
        fillOpacity: 0.35,
        strokeColor: color,
        strokeWeight: 3,
      }}
    />
  );
}
