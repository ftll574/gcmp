/**
 * Tests for the haversine + great-circle math. These are the most-tested
 * functions in the codebase because everything else (PQM calc, map rendering)
 * depends on them being right.
 *
 * Calibration: SFO→NRT is ~4,470 nm. Real-world routings vary by a few miles
 * depending on which lat/lon source you use; ±5nm tolerance is conservative.
 */

import { describe, expect, test } from 'vitest';
import {
  bearingDeg,
  crossesPolar,
  distanceNm,
  greatCirclePath,
  type LatLon,
} from '../../../src/lib/calc/haversine.ts';

const SFO: LatLon = { lat: 37.619806, lon: -122.374821 };
const NRT: LatLon = { lat: 35.76858, lon: 140.388714 };
const BKK: LatLon = { lat: 13.6811, lon: 100.747002 };
const LAX: LatLon = { lat: 33.94250107, lon: -118.4079971 };
const JFK: LatLon = { lat: 40.63980103, lon: -73.77890015 };
const DXB: LatLon = { lat: 25.25279999, lon: 55.36439896 };
const ANC: LatLon = { lat: 61.17440033, lon: -149.9960022 };

describe('distanceNm', () => {
  test('SFO→NRT is approximately 4,442 nm (Our Airports coordinates)', () => {
    // Using Our Airports lat/lon: SFO (37.619806, -122.374821) → NRT (35.76858, 140.388714).
    // Airlines publish marketing distances (e.g. 4477 nm) that include a slightly
    // different airport reference point — the haversine here is purely geometric.
    const d = distanceNm(SFO, NRT);
    expect(d).toBeGreaterThan(4435);
    expect(d).toBeLessThan(4450);
  });

  test('LAX→JFK is approximately 2,144 nm', () => {
    const d = distanceNm(LAX, JFK);
    expect(d).toBeGreaterThan(2135);
    expect(d).toBeLessThan(2155);
  });

  test('zero for same point', () => {
    expect(distanceNm(SFO, SFO)).toBe(0);
  });

  test('symmetric: distance(A,B) === distance(B,A)', () => {
    const d1 = distanceNm(SFO, BKK);
    const d2 = distanceNm(BKK, SFO);
    expect(d1).toBeCloseTo(d2, 6);
  });

  test('triangle inequality: A→B→C ≥ A→C', () => {
    const ab = distanceNm(SFO, NRT);
    const bc = distanceNm(NRT, BKK);
    const ac = distanceNm(SFO, BKK);
    expect(ab + bc).toBeGreaterThanOrEqual(ac);
  });

  test('antipodal-ish distance (≈ half Earth circumference, ~10,800 nm)', () => {
    // SFO antipode is roughly near (-37.6, 57.6) in the Indian Ocean.
    const antipode: LatLon = { lat: -37.619806, lon: 57.625179 };
    const d = distanceNm(SFO, antipode);
    expect(d).toBeGreaterThan(10780);
    expect(d).toBeLessThan(10810);
  });
});

describe('bearingDeg', () => {
  test('SFO→NRT bearing is roughly NW (northwest)', () => {
    const b = bearingDeg(SFO, NRT);
    // Great-circle SFO→NRT goes northwest, then west; initial bearing ~302°.
    expect(b).toBeGreaterThan(295);
    expect(b).toBeLessThan(315);
  });

  test('bearing is in [0, 360)', () => {
    const b = bearingDeg(NRT, SFO);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe('greatCirclePath', () => {
  test('returns N+1 samples including endpoints', () => {
    const path = greatCirclePath(SFO, NRT, 64);
    expect(path.length).toBe(65);
    expect(path[0]?.lat).toBeCloseTo(SFO.lat, 3);
    expect(path[0]?.lon).toBeCloseTo(SFO.lon, 3);
    const last = path[path.length - 1];
    expect(last?.lat).toBeCloseTo(NRT.lat, 3);
    expect(last?.lon).toBeCloseTo(NRT.lon, 3);
  });

  test('SFO→NRT path peaks north of both endpoints (great-circle curves north over the Pacific)', () => {
    const path = greatCirclePath(SFO, NRT, 64);
    const maxLat = Math.max(...path.map((p) => p.lat));
    // Both endpoints are < 38°N; the great circle peaks much higher.
    expect(maxLat).toBeGreaterThan(40);
  });
});

describe('crossesPolar', () => {
  test('SFO→NRT does not cross 70°N (peaks around 51°N)', () => {
    expect(crossesPolar(SFO, NRT, 70)).toBe(false);
  });

  test('LAX→DXB great-circle goes near polar (peaks > 70°N)', () => {
    expect(crossesPolar(LAX, DXB, 70)).toBe(true);
  });

  test('SFO→ANC does not cross 70° (ANC itself is at ~61°N, path stays below 70°)', () => {
    expect(crossesPolar(SFO, ANC, 70)).toBe(false);
  });
});
