/**
 * SVG great-circle arc renderer. Projects the great-circle path through
 * an arbitrary d3-geo projection so the same code handles every
 * projection (Mercator, Equirectangular, Azimuthal Equidistant, Orthographic).
 *
 *   greatCircleSvgPathProjected(from, to, projection, samples?)  → SVG `d` attribute
 *
 * Path strategy: sample the great-circle in lat/lon, project each sample,
 * skip samples that fall outside the projection's clip (orthographic back
 * hemisphere), split with `M` (moveTo) when the projected step jumps too
 * far (antimeridian wraparound on Mercator).
 */

import type { GeoProjection } from 'd3-geo';
import { greatCirclePath } from './haversine.ts';
import type { LatLon } from './haversine.ts';

export interface SvgViewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Build an SVG path `d` string for a single great-circle leg through the
 * given d3-geo projection.
 */
export function greatCircleSvgPathProjected(
  from: LatLon,
  to: LatLon,
  projection: GeoProjection,
  samples: number = 96,
): string {
  const path = greatCirclePath(from, to, samples);
  let d = '';
  let prev: { x: number; y: number } | null = null;
  let started = false;

  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    if (!point) continue;
    const proj = projection([point.lon, point.lat]);
    if (!proj || !Number.isFinite(proj[0]) || !Number.isFinite(proj[1])) {
      // Projection failed (e.g. orthographic clip) — break the path.
      prev = null;
      continue;
    }
    const px = proj[0];
    const py = proj[1];
    let cmd: 'M' | 'L';
    if (!started || prev === null) {
      cmd = 'M';
      started = true;
    } else {
      // Detect long jumps (antimeridian wrap on Mercator-like projections).
      const dx = Math.abs(px - prev.x);
      const dy = Math.abs(py - prev.y);
      cmd = dx > 200 || dy > 200 ? 'M' : 'L';
    }
    d += `${cmd}${px.toFixed(2)} ${py.toFixed(2)} `;
    prev = { x: px, y: py };
  }
  return d.trim();
}

// Legacy Web-Mercator helpers kept for tests/back-compat.

const MERCATOR_LAT_LIMIT = 85;

function clampMercatorLat(lat: number): number {
  if (lat > MERCATOR_LAT_LIMIT) return MERCATOR_LAT_LIMIT;
  if (lat < -MERCATOR_LAT_LIMIT) return -MERCATOR_LAT_LIMIT;
  return lat;
}

export function mercatorProject(p: LatLon): { x: number; y: number } {
  const lat = clampMercatorLat(p.lat);
  const x = (p.lon + 180) / 360;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return { x, y };
}

export function projectToSvg(p: LatLon, vb: SvgViewport): { x: number; y: number } {
  const { x, y } = mercatorProject(p);
  return { x: x * vb.width, y: y * vb.height };
}

/** Legacy path function (Mercator only). Used by tests and the v0.2 MapView. */
export function greatCircleSvgPath(
  from: LatLon,
  to: LatLon,
  vb: SvgViewport,
  samples: number = 64,
): string {
  const path = greatCirclePath(from, to, samples);
  let d = '';
  let prevLon: number | null = null;

  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    if (!point) continue;
    const proj = projectToSvg(point, vb);
    const cmd =
      i === 0 || (prevLon !== null && Math.abs(point.lon - prevLon) > 180) ? 'M' : 'L';
    d += `${cmd}${proj.x.toFixed(2)} ${proj.y.toFixed(2)} `;
    prevLon = point.lon;
  }
  return d.trim();
}
