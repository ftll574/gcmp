import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Airport } from '../../src/lib/types.ts';
import type { RouteLibraryRouteCard } from '../../src/lib/rtw/route-library-entities.ts';
import { buildClusterBundledRoutes, buildRouteMapModel, nearestRouteIdByScreenDistance, routeMapBounds } from '../../src/lib/rtw/route-library-map.ts';

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

  test('snaps route endpoints to cluster centers and bundles duplicate cluster corridors', () => {
    const SFO: Airport = { ...LAX, iata: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', lon: -122.379 };
    const model = buildRouteMapModel([route(TPE, LAX, 5900), route(TSA, SFO, 5600), route(TPE, TSA, 17)], []);
    const bundled = buildClusterBundledRoutes(model, new Map([
      ['TPE', { key: 'cluster:tw', lon: 121.4, lat: 25.1 }],
      ['TSA', { key: 'cluster:tw', lon: 121.4, lat: 25.1 }],
      ['LAX', { key: 'cluster:ca', lon: -120.2, lat: 35 }],
      ['SFO', { key: 'cluster:ca', lon: -120.2, lat: 35 }],
    ]));
    expect(bundled.features).toHaveLength(1);
    expect(bundled.features[0]?.properties.bundleCount).toBe(2);
    const geometry = bundled.features[0]?.geometry;
    const coordinates = geometry?.type === 'LineString' ? geometry.coordinates : geometry?.coordinates.flat();
    expect(coordinates).toEqual(expect.arrayContaining([[121.4, 25.1], [-120.2, 35]]));
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
    const map = screen.getByRole('region', { name: /Route network map|航線地圖/ });
    expect(result.container.querySelector('[data-map-engine="maplibre"]')).not.toBeNull();
    expect(map).not.toBeNull();
    expect(screen.getByText(/Interactive map is unavailable|此瀏覽器無法啟用互動地圖/)).not.toBeNull();
  });

  test('route pages expose route detail as the initial inspector selection', () => {
    render(<RouteEntityMap routes={[route(TPE, TSA, 17)]} hubs={[]} selectedRouteId="TPE-TSA" onAirportSelect={vi.fn()} />);
    expect(screen.getByText('TPE→TSA')).not.toBeNull();
    expect(screen.getByText('Taoyuan → Taipei')).not.toBeNull();
  });

  test('keeps search and alliance filters inside the map surface', () => {
    const result = render(<RouteEntityMap
      routes={[route(TPE, TSA, 17)]}
      hubs={[]}
      onAirportSelect={vi.fn()}
      controls={{
        alliance: 'star',
        onAllianceChange: vi.fn(),
        query: '',
        onQueryChange: vi.fn(),
        searchOpen: false,
        onSearchOpenChange: vi.fn(),
        searchPlaceholder: 'Search airport',
        searchResults: [],
        onSearchResultSelect: vi.fn(),
      }}
    />);
    const mapCard = result.container.querySelector('.entity-map-card');
    expect(mapCard?.querySelector('[aria-label="Alliance filter"]')).not.toBeNull();
    const search = screen.getByRole('combobox', { name: 'Search airport' });
    expect(search.getAttribute('name')).toBe('route-search');
    expect(search.getAttribute('autocomplete')).toBe('off');
    expect(search.getAttribute('aria-autocomplete')).toBe('list');
    expect(screen.getByRole('button', { name: 'Star' }).getAttribute('aria-pressed')).toBe('true');
  });

  test('map search supports keyboard listbox navigation and selection', () => {
    const onSearchResultSelect = vi.fn();
    render(<RouteEntityMap
      routes={[route(TPE, TSA, 17)]}
      hubs={[]}
      onAirportSelect={vi.fn()}
      controls={{
        alliance: 'all',
        onAllianceChange: vi.fn(),
        query: 'T',
        onQueryChange: vi.fn(),
        searchOpen: true,
        onSearchOpenChange: vi.fn(),
        searchPlaceholder: 'Search airport',
        searchResults: [
          { key: 'airport:TPE', selection: { kind: 'airport', id: 'TPE' }, kind: 'airport', title: 'TPE · Taoyuan', subtitle: 'Taiwan Taoyuan International Airport' },
          { key: 'airport:TSA', selection: { kind: 'airport', id: 'TSA' }, kind: 'airport', title: 'TSA · Taipei', subtitle: 'Taipei Songshan Airport' },
        ],
        onSearchResultSelect,
      }}
    />);
    const search = screen.getByRole('combobox', { name: 'Search airport' });
    expect(search.getAttribute('aria-expanded')).toBe('true');
    expect(search.getAttribute('aria-activedescendant')).toBeNull();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /TPE · Taoyuan/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onSearchResultSelect).toHaveBeenCalledWith({ kind: 'airport', id: 'TPE' });
  });
});
