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

function mapScale(svg: SVGSVGElement): number {
  return Number(svg.dataset.mapScale ?? '0');
}

describe('RouteEntityMap interaction', () => {
  test('auto-fits short routes tightly and refits when the selected route becomes long-haul', async () => {
    const onAirportSelect = vi.fn();
    const shortRoute = route(TPE, TSA, 17);
    const result = render(
      <RouteEntityMap routes={[shortRoute]} hubs={[{ airport: TPE, connections: 1 }, { airport: TSA, connections: 1 }]} selectedAirport={TPE} onAirportSelect={onAirportSelect} />,
    );
    const svg = screen.getByRole('img', { name: 'Route network map' }) as SVGSVGElement;
    await waitFor(() => expect(mapScale(svg)).toBeGreaterThan(20));
    const shortScale = mapScale(svg);

    const longRoute = route(TPE, LAX, 5900);
    result.rerender(
      <RouteEntityMap routes={[longRoute]} hubs={[{ airport: TPE, connections: 1 }, { airport: LAX, connections: 1 }]} selectedAirport={TPE} onAirportSelect={onAirportSelect} />,
    );
    await waitFor(() => expect(mapScale(svg)).toBeLessThan(shortScale / 2));
    expect(mapScale(svg)).toBeGreaterThan(1);
  });

  test('supports grab-to-pan, wheel zoom, and fitting back to the current route', async () => {
    const result = render(
      <RouteEntityMap routes={[route(TPE, TSA, 17)]} hubs={[{ airport: TPE, connections: 1 }, { airport: TSA, connections: 1 }]} selectedAirport={TPE} onAirportSelect={vi.fn()} />,
    );
    const svg = result.container.querySelector<SVGSVGElement>('svg[aria-label="Route network map"]')!;
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 560, width: 1200, height: 560, toJSON: () => ({}) }),
    });
    await waitFor(() => expect(mapScale(svg)).toBeGreaterThan(20));
    const fittedScale = mapScale(svg);
    const fittedTx = Number(svg.dataset.mapTx);

    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 600, clientY: 280 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 690, clientY: 315 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 690, clientY: 315 });
    expect(Number(svg.dataset.mapTx)).not.toBeCloseTo(fittedTx, 1);

    fireEvent.wheel(svg, { deltaY: -300, clientX: 600, clientY: 280 });
    expect(mapScale(svg)).toBeGreaterThan(fittedScale);

    fireEvent.click(within(result.container).getByRole('button', { name: /Fit current routes|適合目前航線/ }));
    expect(mapScale(svg)).toBeCloseTo(fittedScale, 3);
  });
});
