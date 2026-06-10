import CityMap from "./features/map/components/CityMap";
import UserMarker from "./features/map/components/UserMarker";
import RoutePolyline from "./features/map/components/RoutePolyline";

import useCurrentLocation from "./features/map/hooks/useCurrentLocation";

function App() {
  const {
    location,
    routePoints,
  } = useCurrentLocation();

  if (!location) {
    return <h1>Getting location...</h1>;
  }

  return (
    <CityMap center={location}>
      <UserMarker
        position={location}
      />

      <RoutePolyline
        points={routePoints}
      />
    </CityMap>
  );
}

export default App;