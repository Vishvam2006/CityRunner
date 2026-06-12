import { pool } from "../db/postgres";

export async function createTerritoryRepo(
  userId: string,
  polygonWkt: string,
  area: number,
) {
  const result = await pool.query(
    `
    INSERT INTO territories
    (
      user_id,
      polygon,
      area_sq_meters
    )
    VALUES
    (
      $1,
      ST_GeomFromText($2, 4326),
      $3
    )
    RETURNING *
    `,
    [userId, polygonWkt, area],
  );

  return result.rows[0];
}

export async function getTerritories() {
  const result = await pool.query(
    `
            SELECT 
                t.id,
                t.user_id,
                t.area_sq_meters,
                ST_AsGeoJSON(t.polygon) as polygon
                FROM territories t
        `,
  );

  return result.rows.map((territory) => ({
    ...territory,
    polygon: JSON.parse(territory.polygon),
  }));
}
