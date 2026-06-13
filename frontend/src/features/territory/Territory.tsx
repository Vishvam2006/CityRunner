import { useQuery } from "@tanstack/react-query";

import CityMap from "../map/components/CityMap";
import TerritoryPolygon from "../map/components/TerritoryPolygon";
import { territoryApi } from "../../api/territory.api";

export function Territory() {
  // Using React Query so that when useCreateTerritory invalidates the
  // "territories" key after a successful save, this component automatically
  // refetches and the new polygon appears on the map without any manual refresh.
  const { data: territories = [] } = useQuery({
    queryKey: ["territories"],
    queryFn: territoryApi.getTerritories,
  });

  return (
    <div className="h-screen">
      <CityMap
        center={{
          lat: 23.2156,
          lng: 72.6369,
        }}
      >
        {territories.map((territory) => {
          const coordinates = territory.polygon.coordinates[0].map(
            ([lng, lat]: [number, number]) => ({
              lat,
              lng,
            }),
          );

          return (
            <TerritoryPolygon
              key={territory.id}
              coordinates={coordinates}
              userId={territory.user_id}
            />
          );
        })}
      </CityMap>
    </div>
  );
}
