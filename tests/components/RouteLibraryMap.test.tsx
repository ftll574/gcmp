import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Airport } from '../../src/lib/types.ts';
import type { RouteLibraryRouteCard } from '../../src/lib/rtw/route-library-entities.ts';
import { buildRouteMapModel, nearestRouteIdByScreenDistance, routeMapBounds } from '../../src/lib/rtw/route-library-map.ts';

vi.mock('../../src/state/use-world-map.ts', () => ({
  useWorldMap: () => ({ features: null, error: null }),
}));

import { RouteEntityMap } from '../../src/components/RouteLibraryMap.tsx';

afterEach(cleanup);
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

const TPE: Airport = { iata: 'TPE', name: 'Taiwan Taoyuan International Airport', city: 'Taoyuan', country: 'TW', lat: 25.0777, lon: 121.2328 };
const TSA: Airport = { iata: 'TSA', name: 'Taipei Songshan Airport', city: 'Taipei', country: 'TW', lat: 25.0694, lon: 121.5525 };
const LAX: Airport = { iata: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'US', lat: 33.9425, lon: -118.4081 };

function route(from: Airport, to: Airport, distanceNm: number): RouteLibraryRouteCard {
  return {
    from,
    to,
    distanceNm,
    carriers: [{ carrier: 'BR', name: 'EVA Air', identity: 'operating', confirmedNumbers: ['BR001'], candidateNumbers: [], sources: [] }],
  };
}

describe('RouteEntityMap MapLibre model', () => {
  test('keeps every route and airport in GeoJSON instead of truncating the network', () => {
    const routes = Array.from({ length: 180 }, (_, index) => route(TPE, {
      ...LAX,
      iata: `X${String(index).padStart(2, '0')}`,
      lon: -118 + index * 0.01,
    }, 5900));
    const model = buildRouteMapModel(routes, [{ airport: TPE, connections: 180 }]);
    expect(model.routes.features).toHaveLength(180);
    expect(model.airports.features).toHaveLength(181);
    expect(model.routesByAirport.get('TPE')).toHaveLength(180);
    expect(model.airports.features.find((feature) => feature.properties.iata === 'TPE')?.properties.hubRank).toBe(0);
    expect(Math.max(...model.routes.features.map((feature) => feature.properties.importance))).toBeCloseTo(1, 6);
  });

  test('short and long routes expose materially different geographic bounds for native fitBounds', () => {
    const shortModel = buildRouteMapModel([route(TPE, TSA, 17)], []);
    const shortBounds = routeMapBounds(shortModel, null, null, TPE.lon)!;
    const longModel = buildRouteMapModel([route(TPE, LAX, 5900)], []);
    const longBounds = routeMapBounds(longModel, null, null, TPE.lon)!;
    expect(shortBounds[1][0] - shortBounds[0][0]).toBeLessThan(1);
    expect(longBounds[1][0] - longBounds[0][0]).toBeGreaterThan(80);
  });

  test('splits antimeridian routes instead of drawing a line across the wrong side of the world', () => {
    const west: Airport = { ...TPE, iata: 'WST', lon: 179, lat: 20 };
    const east: Airport = { ...TSA, iata: 'EST', lon: -179, lat: 21 };
    const model = buildRouteMapModel([route(west, east, 120)], []);
    expect(model.routes.features[0]?.geometry.type).toBe('MultiLineString');
  });

  test('resolves overlapping route hit candidates by actual screen-space distance', () => {
    const northFrom: Airport = { ...TPE, iata: 'NRT', lon: 0, lat: 2 };
    const northTo: Airport = { ...LAX, iata: 'NTO', lon: 10, lat: 2 };
    const southFrom: Airport = { ...TPE, iata: 'SRT', lon: 0, lat: 0 };
    const southTo: Airport = { ...LAX, iata: 'STO', lon: 10, lat: 0 };
    const model = buildRouteMapModel([route(southFrom, southTo, 600), route(northFrom, northTo, 600)], []);
    const nearest = nearestRouteIdByScreenDistance(
      model,
      ['SRT-STO', 'NRT-NTO'],
      { x: 5, y: 1.8 },
      (lon, lat) => ({ x: lon, y: lat }),
    );
    expect(nearest).toBe('NRT-NTO');
    expect(nearestRouteIdByScreenDistance(model, ['SRT-STO'], { x: 5, y: 25 }, (lon, lat) => ({ x: lon, y: lat }), 18)).toBeNull();
  });

  test('renders the MapLibre shell and a truthful fallback when WebGL is unavailable', () => {
    const result = render(<RouteEntityMap routes={[route(TPE, TSA, 17)]} hubs={[]} selectedAirport={TPE} onAirportSelect={vi.fn()} />);
    const map = screen.getByRole('application', { name: 'Route network map' });
    expect(result.container.querySelector('[data-map-engine="maplibre"]')).not.toBeNull();
    expect(map).not.toBeNull();
    expect(screen.getByText(/Interactive map is unavailable|此瀏覽器無法啟用互動地圖/)).not.toBeNull();
  });

  test('route pages expose route detail as the initial inspector selection', () => {
    render(<RouteEntityMap routes={[route(TPE, TSA, 17)]} hubs={[]} selectedRouteId="TPE-TSA" onAirportSelect={vi.fn()} />);
    expect(screen.getByText('TPE→TSA')).not.toBeNull();
    expect(screen.getByText('Taoyuan → Taipei')).not.toBeNull();
  });
});
