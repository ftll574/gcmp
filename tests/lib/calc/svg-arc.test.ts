import { describe, expect, test } from 'vitest';
import { buildProjection } from '../../../src/lib/calc/projections.ts';
import { greatCircleSvgPathProjected } from '../../../src/lib/calc/svg-arc.ts';

describe('greatCircleSvgPathProjected', () => {
  test('unwraps Mercator arcs across the antimeridian instead of splitting mid-route', () => {
    const width = 1000;
    const projection = buildProjection('mercator', { width, height: 500 });
    const d = greatCircleSvgPathProjected(
      { lat: 35.5494, lon: 139.7798 },
      { lat: 33.9425, lon: -118.4081 },
      projection,
      96,
      { wrapWidth: width },
    );

    expect(d.match(/M/g)?.length).toBe(1);
    expect(d.match(/L/g)?.length).toBeGreaterThan(60);
  });
});
