export interface Coordinate {
  lat: number;
  lng: number;
}

export interface GpsPoint extends Coordinate {
  accuracy?: number;
  speed?: number | null;
}