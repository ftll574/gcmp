/**
 * Great-circle distance and bearing utilities. Pure math, no dependencies.
 *
 *   distanceNm(a, b)     →  great-circle distance in nautical miles
 *   bearingDeg(a, b)     →  initial bearing in degrees, 0=N, clockwise
 *   greatCirclePath(a,b) →  sampled polyline along the great circle
 *
 * References: Chris Veness's "Calculate distance, bearing and more between
 * Latitude/Longitude points" — formulas widely audited; we keep the math
 * inline so the engine module is self-contained.
 */

const EARTH_RADIUS_NM = 3440.065; // nautical miles (mean Earth radius)
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/** Great-circle distance between two points in nautical miles. */
export function distanceNm(a: LatLon, b: LatLon): number {
  const phi1 = a.lat * DEG_TO_RAD;
  const phi2 = b.lat * DEG_TO_RAD;
  const dPhi = (b.lat - a.lat) * DEG_TO_RAD;
  const dLambda = (b.lon - a.lon) * DEG_TO_RAD;

  const sinDPhi = Math.sin(dPhi / 2);
  const sinDLambda = Math.sin(dLambda / 2);

  const aa =
    sinDPhi * sinDPhi + Math.cos(phi1) * Math.cos(phi2) * sinDLambda * sinDLambda;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));

  return EARTH_RADIUS_NM * c;
}

/** Initial bearing from a to b, in degrees, 0=N, clockwise. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const phi1 = a.lat * DEG_TO_RAD;
  const phi2 = b.lat * DEG_TO_RAD;
  const lambda1 = a.lon * DEG_TO_RAD;
  const lambda2 = b.lon * DEG_TO_RAD;

  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  const theta = Math.atan2(y, x);

  return ((theta * RAD_TO_DEG) + 360) % 360;
}

/**
 * Sample N intermediate points along the great-circle from a to b (inclusive).
 * Used by the SVG arc renderer to draw a curved path on a flat-map projection.
 *
 *      a ●──○──○──○──○──● b
 *           N intermediate samples
 */
export function greatCirclePath(a: LatLon, b: LatLon, n: number = 64): LatLon[] {
  const phi1 = a.lat * DEG_TO_RAD;
  const phi2 = b.lat * DEG_TO_RAD;
  const lambda1 = a.lon * DEG_TO_RAD;
  const lambda2 = b.lon * DEG_TO_RAD;

  const d = distanceNm(a, b) / EARTH_RADIUS_NM; // angular distance in radians
  if (d === 0 || !Number.isFinite(d)) {
    return [a, b];
  }
  const sinD = Math.sin(d);
  if (sinD === 0) {
    return [a, b]; // antipodal — no unique great circle; fall back to straight line
  }

  const out: LatLon[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / sinD;
    const B = Math.sin(f * d) / sinD;
    const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
    const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD_TO_DEG;
    const lon = Math.atan2(y, x) * RAD_TO_DEG;
    out.push({ lat, lon });
  }
  return out;
}

/** Does any sample of the great-circle path cross 70°N or 70°S? */
export function crossesPolar(a: LatLon, b: LatLon, threshold: number = 70): boolean {
  const path = greatCirclePath(a, b, 32);
  return path.some((p) => Math.abs(p.lat) >= threshold);
}
