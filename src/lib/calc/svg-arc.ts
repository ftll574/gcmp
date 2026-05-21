/**
 * SVG great-circle arc renderer. Replaces deck.gl for v1 — saves ~350KB
 * bundle. Projects (lat, lon) → (svg-x, svg-y) using Web Mercator clamped
 * at ±85° (avoids singularity at the poles).
 *
 *   greatCircleSvgPath(legs, viewBox)  →  SVG `d` attribute string
 *
 * Path strategy: each leg samples the great circle as a polyline (`L x y` per
 * step). When the antimeridian (±180° longitude) crosses, we split the path
 * with `M` (moveTo) so the SVG doesn't draw a horizontal line across the world.
 */

import { greatCirclePath } from './haversine.ts';
import type { LatLon } from './haversine.ts';

export interface SvgViewport {
  readonly width: number;
  readonly height: number;
}

const MERCATOR_LAT_LIMIT = 85;

function clampMercatorLat(lat: number): number {
  if (lat > MERCATOR_LAT_LIMIT) return MERCATOR_LAT_LIMIT;
  if (lat < -MERCATOR_LAT_LIMIT) return -MERCATOR_LAT_LIMIT;
  return lat;
}

/** Project lat/lon → fractional [0..1] x/y on a Web Mercator world map. */
export function mercatorProject(p: LatLon): { x: number; y: number } {
  const lat = clampMercatorLat(p.lat);
  const x = (p.lon + 180) / 360;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return { x, y };
}

/** Project a LatLon into SVG pixel coordinates for the given viewport. */
export function projectToSvg(p: LatLon, vb: SvgViewport): { x: number; y: number } {
  const { x, y } = mercatorProject(p);
  return { x: x * vb.width, y: y * vb.height };
}

/**
 * Build an SVG path `d` string for a single great-circle leg, splitting if
 * the path crosses the antimeridian (so the line doesn't whip across the
 * world horizontally on Mercator).
 */
export function greatCircleSvgPath(
  from: LatLon,
  to: LatLon,
  vb: SvgViewport,
  samples: number = 64
): string {
  const path = greatCirclePath(from, to, samples);
  let d = '';
  let prevLon: number | null = null;

  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    if (!point) continue;
    const proj = projectToSvg(point, vb);
    const cmd =
      i === 0 || (prevLon !== null && Math.abs(point.lon - prevLon) > 180)
        ? 'M'
        : 'L';
    d += `${cmd}${proj.x.toFixed(2)} ${proj.y.toFixed(2)} `;
    prevLon = point.lon;
  }
  return d.trim();
}
