import * as turf from "@turf/turf";

export function calculateDistance(
  points: {
    latitude: number;
    longitude: number;
  }[]
) {
  let totalDistance = 0;

  for (let i = 1; i < points.length; i++) {
    const from = turf.point([
      points[i - 1].longitude,
      points[i - 1].latitude,
    ]);

    const to = turf.point([
      points[i].longitude,
      points[i].latitude,
    ]);

    totalDistance += turf.distance(
      from,
      to,
      { units: "kilometers" }
    );
  }

  return totalDistance;
}