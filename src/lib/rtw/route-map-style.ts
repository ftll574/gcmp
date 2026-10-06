import type { ExpressionSpecification } from 'maplibre-gl';

/** The route explorer presents one geographic world, even on ultrawide views. */
export const ROUTE_MAP_RENDER_WORLD_COPIES = false;

/**
 * Build line width without wrapping a zoom expression in a multiplication.
 * MapLibre requires `zoom` to be the input of a top-level step/interpolate.
 */
export function routeLineWidthExpression(fingerprint: boolean): ExpressionSpecification {
  const bundleScale: ExpressionSpecification = [
    'interpolate', ['linear'], ['coalesce', ['get', 'bundleCount'], 1],
    1, 1, 4, 1.2, 12, 1.5, 40, 2.1,
  ];
  const importanceScale: ExpressionSpecification = [
    'interpolate', ['linear'], ['get', 'importance'],
    0, 0.55, 0.45, 1, 1, 2.05,
  ];
  const scaledWidth = (base: number): ExpressionSpecification => fingerprint
    ? ['*', ['*', base, importanceScale], bundleScale]
    : ['*', base, bundleScale];

  return [
    'interpolate', ['linear'], ['zoom'],
    0, scaledWidth(fingerprint ? 0.8 : 0.7),
    3, scaledWidth(fingerprint ? 1.35 : 1.2),
    8, scaledWidth(fingerprint ? 2.2 : 2),
  ];
}
