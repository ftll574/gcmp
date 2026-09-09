/**
 * Lightweight projection identifiers shared by routing state, URL parsing,
 * and the UI shell.
 *
 * Keep this module free of d3 imports so code that only needs the persisted
 * projection id does not pull the map-rendering stack into the initial bundle.
 */
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

export const DEFAULT_PROJECTION: ProjectionId = 'mercator';
