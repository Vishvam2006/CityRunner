import { Request, Response } from "express";
import { pool } from "../db/postgres";

export const testTerritory = async (
  req: Request,
  res: Response
) => {
  try {
    const { coordinates } = req.body;

    if (!coordinates || coordinates.length < 4) {
      return res.status(400).json({
        success: false,
        message: "At least 4 coordinates required",
      });
    }

    const lineString = coordinates
      .map(
        ([lng, lat]: [number, number]) =>
          `${lng} ${lat}`
      )
      .join(",");

    const query = `
      WITH path AS (
        SELECT ST_GeomFromText(
          'LINESTRING(${lineString})',
          4326
        ) AS geom
      )
      SELECT
        ST_IsClosed(geom) AS closed,
        CASE
          WHEN ST_IsClosed(geom)
          THEN ST_Area(
            ST_Transform(
              ST_MakePolygon(geom),
              3857
            )
          )
          ELSE NULL
        END AS area
      FROM path;
    `;

    const result = await pool.query(query);

    return res.status(200).json({
      success: true,
      closed: result.rows[0].closed,
      area: result.rows[0].area,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};