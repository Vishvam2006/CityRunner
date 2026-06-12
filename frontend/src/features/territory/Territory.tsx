import { useEffect, useState } from "react";

import CityMap from "../map/components/CityMap";
import TerritoryPolygon from "../map/components/TerritoryPolygon";

import { getTerritories } from "../map/services/territory.service";

export function Territory() {
  const [territories, setTerritories] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const data = await getTerritories();

      setTerritories(data);
    }

    load();
  }, []);

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
