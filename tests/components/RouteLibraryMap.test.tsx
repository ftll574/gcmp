import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Airport } from '../../src/lib/types.ts';
import type { RouteLibraryRouteCard } from '../../src/lib/rtw/route-library-entities.ts';

vi.mock('../../src/state/use-world-map.ts', () => ({
  useWorldMap: () => ({ features: null, error: null }),
}));

import { RouteEntityMap } from '../../src/components/RouteLibraryExplorer.tsx';

afterEach(cleanup);

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

function mapScale(map: HTMLElement): number {
  return Number(map.dataset.mapScale ?? '0');
}

describe('RouteEntityMap interaction', () => {
  test('auto-fits short routes tightly and refits when the selected route becomes long-haul', async () => {
    const onAirportSelect = vi.fn();
    const shortRoute = route(TPE, TSA, 17);
    const result = render(
      <RouteEntityMap routes={[shortRoute]} hubs={[{ airport: TPE, connections: 1 }, { airport: TSA, connections: 1 }]} selectedAirport={TPE} onAirportSelect={onAirportSelect} />,
    );
    const map = screen.getByRole('img', { name: 'Route network map' });
    expect(map.getAttribute('data-renderer')).toBe('canvas');
    await waitFor(() => expect(mapScale(map)).toBeGreaterThan(20));
    const shortScale = mapScale(map);

    const longRoute = route(TPE, LAX, 5900);
    result.rerender(
      <RouteEntityMap routes={[longRoute]} hubs={[{ airport: TPE, connections: 1 }, { airport: LAX, connections: 1 }]} selectedAirport={TPE} onAirportSelect={onAirportSelect} />,
    );
    await waitFor(() => expect(mapScale(map)).toBeLessThan(shortScale / 2));
    expect(mapScale(map)).toBeGreaterThan(1);
  });

  test('supports grab-to-pan, wheel zoom, and fitting back to the current route', async () => {
    const result = render(
      <RouteEntityMap routes={[route(TPE, TSA, 17)]} hubs={[{ airport: TPE, connections: 1 }, { airport: TSA, connections: 1 }]} selectedAirport={TPE} onAirportSelect={vi.fn()} />,
    );
    const map = result.container.querySelector<HTMLCanvasElement>('canvas[aria-label="Route network map"]')!;
    Object.defineProperty(map, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 560, width: 1200, height: 560, toJSON: () => ({}) }),
    });
    await waitFor(() => expect(mapScale(map)).toBeGreaterThan(20));
    const fittedScale = mapScale(map);
    const fittedTx = Number(map.dataset.mapTx);

    fireEvent.pointerDown(map, { button: 0, pointerId: 1, clientX: 600, clientY: 280 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 690, clientY: 315 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 690, clientY: 315 });
    await waitFor(() => expect(Number(map.dataset.mapTx)).not.toBeCloseTo(fittedTx, 1));

    fireEvent.wheel(map, { deltaY: -300, clientX: 600, clientY: 280 });
    expect(mapScale(map)).toBeGreaterThan(fittedScale);

    fireEvent.click(within(result.container).getByRole('button', { name: /Fit network|顯示完整航網/ }));
    expect(mapScale(map)).toBeCloseTo(fittedScale, 3);
  });

  test('keeps route geometry out of the DOM so pan and zoom stay lightweight', () => {
    const routes = Array.from({ length: 180 }, (_, index) => route(TPE, { ...LAX, iata: `X${String(index).padStart(2, '0')}` }, 5900));
    const result = render(<RouteEntityMap routes={routes} hubs={[{ airport: TPE, connections: 180 }]} selectedAirport={TPE} onAirportSelect={vi.fn()} />);
    const map = result.container.querySelector<HTMLCanvasElement>('canvas[data-renderer="canvas"]');
    expect(map).not.toBeNull();
    expect(Number(map?.dataset.mapNodeCount)).toBe(181);
    expect(result.container.querySelectorAll('.entity-map-routes path')).toHaveLength(0);
    expect(result.container.querySelectorAll('svg')).toHaveLength(0);
  });
});
