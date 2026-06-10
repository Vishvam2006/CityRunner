import { ReactNode } from "react";

import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";

import type { Coordinate } from "../types/map.types";

interface CityMapProps {
  center: Coordinate;
  children?: ReactNode;
}

const containerStyle = {
  width: "100%",
  height: "100vh",
};

export default function CityMap({ center, children }: CityMapProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });

  if (!isLoaded) {
    return <h2>Loading Map...</h2>;
  }

  return (
    <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={17}>
      {children}
    </GoogleMap>
  );
}
