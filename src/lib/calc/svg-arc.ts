/**
 * SVG great-circle arc renderer. Projects the great-circle path through
 * an arbitrary d3-geo projection so the same code handles every
 * projection (Mercator, Equirectangular, Azimuthal Equidistant, Orthographic).
 *
 *   greatCircleSvgPathProjected(from, to, projection, samples?, options?)  → SVG `d` attribute
 *
 * Path strategy: sample the great-circle in lat/lon, project each sample,
 * skip samples that fall outside the projection's clip (orthographic back
 * hemisphere). Wrapping projections can opt into continuous x-unwrapping so
 * the map layer can tile the path instead of breaking it at the antimeridian.
 */

import type { GeoProjection } from 'd3-geo';
import { greatCirclePath } from './haversine.ts';
import type { LatLon } from './haversine.ts';

export interface SvgViewport {
  readonly width: number;
  readonly height: number;
}

export interface GreatCirclePathOptions {
  /**
   * Width of one projected world tile. When provided, projected x coordinates
   * are unwrapped across the antimeridian instead of splitting the SVG path.
   */
  readonly wrapWidth?: number;
}

/**
 * Build an SVG path `d` string for a single great-circle leg through the
 * given d3-geo projection.
 *
 * Antimeridian split: when the projected step between consecutive samples
 * is larger than half the projection's translate-x (i.e. roughly half the
 * viewport width), we treat it as an antimeridian wrap and break the path
 * with a fresh `M`. This is more robust than a hardcoded pixel threshold:
 * it scales with the viewport, so the same arc looks right on a phone and
 * on a 4K monitor.
 *
 * Orthographic clip: samples whose projection returns null (back hemisphere)
 * also trigger a `M` on the next visible sample, so partial visibility
 * renders correctly without a stray line across the globe.
 */
export function greatCircleSvgPathProjected(
  from: LatLon,
  to: LatLon,
  projection: GeoProjection,
  samples: number = 96,
  options: GreatCirclePathOptions = {},
): string {
  const path = greatCirclePath(from, to, samples);
  const translate = projection.translate();
  // Half-viewport width: any single-step horizontal jump larger than this is
  // almost certainly a longitudinal wrap (antimeridian), not a real arc.
  // For non-cylindrical projections (azimuthal, orthographic) the threshold
  // is also reasonable: arcs that span half the projected width really are
  // discontinuities introduced by the projection itself.
  const jumpThresholdX = (translate[0] ?? 200) * 0.95;
  const jumpThresholdY = (translate[1] ?? 200) * 0.95;

  let d = '';
  let prev: { x: number; y: number } | null = null;
  let wrapOffsetX = 0;
  let started = false;
  const wrapWidth = options.wrapWidth;

  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    if (!point) continue;
    const proj = projection([point.lon, point.lat]);
    if (!proj || !Number.isFinite(proj[0]) || !Number.isFinite(proj[1])) {
      prev = null;
      continue;
    }
    let px = proj[0] + wrapOffsetX;
    const py = proj[1];
    let cmd: 'M' | 'L';
    if (!started || prev === null) {
      cmd = 'M';
      started = true;
    } else {
      if (wrapWidth !== undefined && wrapWidth > 0) {
        const dx = px - prev.x;
        if (dx > wrapWidth / 2) {
          wrapOffsetX -= wrapWidth;
          px = proj[0] + wrapOffsetX;
        } else if (dx < -wrapWidth / 2) {
          wrapOffsetX += wrapWidth;
          px = proj[0] + wrapOffsetX;
        }
        cmd = 'L';
      } else {
        const dx = Math.abs(px - prev.x);
        const dy = Math.abs(py - prev.y);
        cmd = dx > jumpThresholdX || dy > jumpThresholdY ? 'M' : 'L';
      }
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
