export interface Coordinate {
  lat: number;
  lng: number;
}

export interface GpsPoint extends Coordinate {
  accuracy?: number;
  speed?: number | null;
}

export interface Territory {
  id: string;
  user_id: string;
  area_sq_meters: number;
  polygon: {
    type: "Polygon";
    coordinates: number[][][];
  };
}