/**
 * Map projection registry. Wraps d3-geo so the rest of the engine sees a
 * uniform `Projection` type.
 *
 *   getProjection('mercator', { width: 1024, height: 600, centerLat, centerLon })
 *
 * Projections supported (v0.3):
 *   - mercator             — familiar, distorts polar routes
 *   - equirectangular      — flat plate carrée, 2:1 aspect, fast
 *   - azimuthal-equidistant — gcmap classic: distances from center are straight
 *   - orthographic         — sphere with only the visible hemisphere drawn
 *
 * Engine purity: this module is pure math via d3-geo. No DOM, no React.
 */

import {
  geoAzimuthalEquidistant,
  geoEquirectangular,
  geoMercator,
  geoOrthographic,
} from 'd3-geo';
import type { GeoProjection } from 'd3-geo';

export type ProjectionId =
  | 'mercator'
  | 'equirectangular'
  | 'azimuthal-equidistant'
  | 'orthographic';

export const PROJECTION_IDS: ReadonlyArray<ProjectionId> = [
  'mercator',
  'equirectangular',
  'azimuthal-equidistant',
  'orthographic',
];

export interface ProjectionOptions {
  width: number;
  height: number;
  /** Center latitude (only used by azimuthal + orthographic). */
  centerLat?: number;
  /** Center longitude (only used by azimuthal + orthographic). */
  centerLon?: number;
  /** Optional scale override; default fits the projection's world to the viewport. */
  scale?: number;
}

/**
 * Build a d3-geo projection that fits a world map into the given viewport.
 * Returns the projection function (lat-lon → svg-x-y) plus the inverse.
 */
export function buildProjection(
  id: ProjectionId,
  opts: ProjectionOptions,
): GeoProjection {
  const { width, height, centerLat = 0, centerLon = 0, scale } = opts;
  let p: GeoProjection;
  switch (id) {
    case 'mercator':
      p = geoMercator();
      break;
    case 'equirectangular':
      p = geoEquirectangular();
      break;
    case 'azimuthal-equidistant':
      p = geoAzimuthalEquidistant().rotate([-centerLon, -centerLat]);
      break;
    case 'orthographic':
      p = geoOrthographic().rotate([-centerLon, -centerLat]).clipAngle(90);
      break;
    default: {
      // Exhaustiveness guard. Should never hit.
      const _exhaustive: never = id;
      void _exhaustive;
      p = geoMercator();
    }
  }

  // Fit the projection to the viewport; then apply an optional scale multiplier.
  const worldFeature = { type: 'Sphere' as const };
  p.fitSize([width, height], worldFeature);
  if (scale !== undefined) {
    // Multiply the auto-fit scale so zoom plays nicely with viewport changes.
    p.scale(p.scale() * scale);
    // Re-center after scale change so the projection still sits in the viewport.
    p.translate([width / 2, height / 2]);
  }
  return p;
}

/**
 * Convert a (lat, lon) pair to SVG (x, y) via the given d3-geo projection.
 * Returns null if the point falls outside the projection's clip (e.g. the
 * back hemisphere on orthographic).
 */
export function project(
  p: GeoProjection,
  lat: number,
  lon: number,
): { x: number; y: number } | null {
  const coords = p([lon, lat]);
  if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
    return null;
  }
  return { x: coords[0], y: coords[1] };
}

/**
 * Default projection is the orthographic 3D globe — this matches what most
 * users expect a modern flight-routing map to look like (and what makes
 * gcmap's signature "Azimuthal Equidistant" mode discoverable as a sibling
 * projection on the toolbar). Users with an explicit `?proj=` in their URL
 * see that projection instead.
 */
export const DEFAULT_PROJECTION: ProjectionId = 'orthographic';
