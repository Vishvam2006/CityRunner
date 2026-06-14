import { describe, it, expect } from "@jest/globals";
import {
  Point2D,
  haversineM,
  segmentIntersection,
  shoelaceAreaM2,
  detectAllLoops,
  parseIntersectionPoint,
  generateCircle,
  generateSquare,
  generateOval,
  generateFigureEight,
  generateStraightLine,
  generateZigzag,
  addNoise,
} from "./geometryUtils";

describe("geometryUtils", () => {
  describe("haversineM", () => {
    it("computes distance correctly (equator)", () => {
      // 1 degree longitude at equator is ~111.19 km
      const d = haversineM(0, 0, 0, 1);
      expect(d).toBeCloseTo(111194.92, 0);
    });

    it("handles zero distance", () => {
      expect(haversineM(51.5, -0.1, 51.5, -0.1)).toBe(0);
    });
  });

  describe("segmentIntersection", () => {
    it("finds intersection of crossing segments", () => {
      // + shape crossing at (0,0)
      const a = { lat: -1, lng: 0 };
      const b = { lat: 1, lng: 0 };
      const c = { lat: 0, lng: -1 };
      const d = { lat: 0, lng: 1 };

      const ix = segmentIntersection(a, b, c, d);
      expect(ix).not.toBeNull();
      expect(ix?.lat).toBeCloseTo(0);
      expect(ix?.lng).toBeCloseTo(0);
    });

    it("returns null for parallel segments", () => {
      const a = { lat: 0, lng: 0 };
      const b = { lat: 0, lng: 1 };
      const c = { lat: 1, lng: 0 };
      const d = { lat: 1, lng: 1 };
      expect(segmentIntersection(a, b, c, d)).toBeNull();
    });

    it("returns null for collinear segments", () => {
      const a = { lat: 0, lng: 0 };
      const b = { lat: 0, lng: 2 };
      const c = { lat: 0, lng: 1 };
      const d = { lat: 0, lng: 3 };
      expect(segmentIntersection(a, b, c, d)).toBeNull();
    });

    it("returns null when segments don't quite reach", () => {
      const a = { lat: -1, lng: 0 };
      const b = { lat: -0.1, lng: 0 };
      const c = { lat: 0, lng: -1 };
      const d = { lat: 0, lng: 1 };
      expect(segmentIntersection(a, b, c, d)).toBeNull();
    });
  });

  describe("parseIntersectionPoint", () => {
    it("parses valid POINT WKT", () => {
      const pt = parseIntersectionPoint("POINT(72.8 19.0)");
      expect(pt).toEqual({ lng: 72.8, lat: 19.0 });
    });

    it("parses MULTIPOINT WKT", () => {
      const pt = parseIntersectionPoint("MULTIPOINT((72.8 19.0), (72.9 19.1))");
      expect(pt).toEqual({ lng: 72.8, lat: 19.0 });
    });

    it("returns null for LINESTRING", () => {
      expect(parseIntersectionPoint("LINESTRING(0 0, 1 1)")).toBeNull();
    });
  });

  describe("shoelaceAreaM2", () => {
    it("computes area of a square correctly", () => {
      // 100x100m square at equator
      const pts = generateSquare(0, 0, 100, 2);
      const area = shoelaceAreaM2(pts);
      // Area should be exactly 10,000. Allow a tiny margin for projection rounding
      expect(area).toBeGreaterThan(9900);
      expect(area).toBeLessThan(10100);
    });

    it("returns 0 for < 3 points", () => {
      expect(shoelaceAreaM2([])).toBe(0);
      expect(shoelaceAreaM2([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])).toBe(0);
    });
  });

  describe("detectAllLoops (synthetic GPS testing)", () => {
    const MUMBAI_LAT = 19.076;
    const MUMBAI_LNG = 72.877;

    it("detects a clean circular loop", () => {
      // Circle with 100m radius (~314m circumference, ~31k area), 60 points
      const points = generateCircle(MUMBAI_LAT, MUMBAI_LNG, 100, 60);

      // It's a perfect circle, but it doesn't cross itself!
      // A circle only crosses itself if we keep running past the start point.
      // Let's add 10 points from the start to force a crossing.
      const runPath = [...points, ...points.slice(0, 15)];

      const loops = detectAllLoops(runPath);
      expect(loops.length).toBeGreaterThanOrEqual(1);
      
      const loop = loops[0];
      // Expected area: π*r^2 ≈ 31,415 m². Due to 60-sided polygon approx: slightly less.
      expect(loop.estimatedAreaM2).toBeGreaterThan(30000);
      expect(loop.estimatedAreaM2).toBeLessThan(32000);
    });

    it("detects a noisy loop", () => {
      const points = generateSquare(MUMBAI_LAT, MUMBAI_LNG, 100, 10);
      const runPath = addNoise([...points, ...points.slice(0, 5)], 3.0); // 3m GPS noise

      const loops = detectAllLoops(runPath);
      expect(loops.length).toBeGreaterThanOrEqual(1); // May find multiple crossings in noise
      expect(loops[0].estimatedAreaM2).toBeGreaterThan(9000); // Nominal 10k
    });

    it("does not detect loops in a straight line", () => {
      const path = generateStraightLine(MUMBAI_LAT, MUMBAI_LNG, 1000, 50);
      const loops = detectAllLoops(path);
      expect(loops.length).toBe(0);
    });

    it("does not trigger on zigzag path (parallel roads)", () => {
      // Zigzag back and forth, but segments don't cross
      const path = generateZigzag(MUMBAI_LAT, MUMBAI_LNG, 50, 20, 40);
      const loops = detectAllLoops(path);
      expect(loops.length).toBe(0);
    });

    it("detects two loops in a figure-8", () => {
      // Two 100m circles tangent at the center. Total 80 points (40 each)
      // Path goes left circle -> center -> right circle -> center
      const leftCircle = generateCircle(MUMBAI_LAT, MUMBAI_LNG - 0.001, 100, 40);
      const rightCircle = generateCircle(MUMBAI_LAT, MUMBAI_LNG + 0.001, 100, 40, Math.PI);
      
      // To close them, we must overlap slightly past the tangent point
      const runPath = [
        ...leftCircle, 
        ...leftCircle.slice(0, 5), // Close left
        ...rightCircle,
        ...rightCircle.slice(0, 5) // Close right
      ];

      const loops = detectAllLoops(runPath);
      expect(loops.length).toBeGreaterThanOrEqual(2);
      expect(loops[0].estimatedAreaM2).toBeGreaterThan(30000);
    });

    it("detects a small urban loop (15m x 15m) with new lower thresholds", () => {
      // 15m x 15m square = 225m² area. 
      // 10 pts per side = 40 pts total (1.5m spacing, well under 2m so we don't trip MIN_SEGMENT)
      // Actually let's use 3 pts per side = 12 pts total (5m spacing)
      const points = generateSquare(MUMBAI_LAT, MUMBAI_LNG, 15, 3);
      const runPath = [...points, ...points.slice(0, 3)]; // Close the loop

      // Uses new default thresholds (MIN_SKIP_SEGMENTS=5, MIN_LOOP_AREA_M2=25)
      const loops = detectAllLoops(runPath);
      expect(loops.length).toBeGreaterThanOrEqual(1);
      
      // Area should be exactly 225m² (before any ST_MakeValid shrinking, which isn't tested here)
      expect(loops[0].estimatedAreaM2).toBeGreaterThan(200);
      expect(loops[0].estimatedAreaM2).toBeLessThan(250);
    });

    it("ignores stationary noise (too few segments skipped)", () => {
      // Small random walk (all within 5m, meaning it crosses itself constantly)
      const path = addNoise(generateStraightLine(MUMBAI_LAT, MUMBAI_LNG, 2, 20), 5.0);
      
      // With MIN_SKIP = 5, stationary noise rarely forms a 25m² loop after 5 points anyway.
      const loops = detectAllLoops(path);
      expect(loops.length).toBe(0);
    });
  });
});
