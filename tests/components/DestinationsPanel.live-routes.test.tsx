import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DestinationsPanel } from '../../src/components/DestinationsPanel.tsx';
import { RouteNetworkCatalogSchema } from '../../src/lib/schemas/route-network.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const airports = [
  { iata: 'TPE', name: 'Taoyuan', city: 'Taipei', country: 'TW', lat: 25.08, lon: 121.23 },
  { iata: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'TH', lat: 13.69, lon: 100.75 },
];
const emptyNetwork = RouteNetworkCatalogSchema.parse({
  version: '2026.3',
  coverage: 'curated-not-complete',
  sources: [{ id: 'fixture-empty', url: 'https://example.com/empty', checkedOn: '2026-09-08', note: 'No static routes in this fixture.' }],
  carrierUniverses: [],
  routes: [],
});

test('current EVA TPE-BKK route is upgraded by official evidence and exposes real BR flight numbers', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-07T20:00:00Z'));
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/schedules/routes') {
      return new Response(JSON.stringify({
        version: 1,
        origin: 'TPE',
        source: { name: 'air-routes.com current scheduled passenger routes', url: 'https://air-routes.com/developers' },
        checkedAt: '2026-09-08T01:00:00.000Z',
        expiresAt: '2026-09-08T01:05:00.000Z',
        routes: [{
          from: 'TPE', to: 'BKK', status: 'active', seasonalityLabel: null,
          sourceUrl: 'https://air-routes.com/r/TPE-BKK',
          carriers: [{ code: 'BR', name: 'EVA Air', days: ['Tue'], seasonalNote: null }],
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchImpl);
  const onAddPair = vi.fn();
  render(<DestinationsPanel
    airports={airports}
    schedules={[]}
    carriers={[{ code: 'BR', name: 'EVA Air' }]}
    lookupAirport={(iata) => airports.find((airport) => airport.iata === iata)}
    network={emptyNetwork}
    pendingIata="TPE"
    liveApiBase="/api"
    onAddPair={onAddPair}
  />);

  fireEvent.click(document.querySelector('.rtw-next-advanced > summary')!);
  fireEvent.change(document.querySelector('.rtw-explorer-date input[type="date"]')!, { target: { value: '2026-09-08' } });
  await waitFor(() => expect(document.querySelector('[data-select-route="TPE-BKK"]')).toBeInTheDocument());
  fireEvent.click(document.querySelector('[data-select-route="TPE-BKK"]')!);
  expect(document.querySelector('[data-verify-live-carrier="BR:TPE-BKK"]')).toBeNull();
  for (const flight of ['BR75', 'BR67', 'BR211', 'BR205', 'BR61']) {
    expect(document.querySelector(`[data-select-flight-number="${flight}:TPE-BKK"]`)).toBeInTheDocument();
  }
  expect([...document.querySelectorAll<HTMLElement>('[data-select-flight-number$=":TPE-BKK"]')]
    .map((node) => node.dataset.selectFlightNumber?.split(':')[0]))
    .toEqual(['BR75', 'BR67', 'BR211', 'BR205', 'BR61']);
  expect(document.querySelector('[data-select-flight-number="BR2217:TPE-BKK"]')).toBeNull();
  expect(document.querySelector('[data-select-flight-later="BR:TPE-BKK"]')).toBeInTheDocument();

  fireEvent.click(document.querySelector('[data-select-flight-number="BR67:TPE-BKK"]')!);
  fireEvent.click(document.querySelector('[data-open-flight-dates="TPE-BKK"]')!);
  fireEvent.click(document.querySelector<HTMLButtonElement>('.flight-dates-query')!);
  await waitFor(() => expect(document.querySelector('[data-published-flight="BR67"]')).toBeInTheDocument());
  expect(document.querySelector('[data-published-flight="BR67"]')).toHaveTextContent('2026-09-08 08:15');
  expect(onAddPair).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('a genuinely live-only BR route still cannot be persisted before operating identity is verified', async () => {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/schedules/routes') {
      return new Response(JSON.stringify({
        version: 1,
        origin: 'BKK',
        source: { name: 'air-routes.com current scheduled passenger routes', url: 'https://air-routes.com/developers' },
        checkedAt: '2026-09-08T01:00:00.000Z',
        expiresAt: '2026-09-08T01:05:00.000Z',
        routes: [{
          from: 'BKK', to: 'TPE', status: 'active', seasonalityLabel: null,
          sourceUrl: 'https://air-routes.com/r/BKK-TPE',
          carriers: [{ code: 'BR', name: 'EVA Air', days: ['Tue'], seasonalNote: null }],
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchImpl);
  const onAddPair = vi.fn();
  render(<DestinationsPanel
    airports={airports}
    schedules={[]}
    carriers={[{ code: 'BR', name: 'EVA Air' }]}
    lookupAirport={(iata) => airports.find((airport) => airport.iata === iata)}
    network={emptyNetwork}
    pendingIata="BKK"
    liveApiBase="/api"
    onAddPair={onAddPair}
  />);

  await waitFor(() => expect(document.querySelector('[data-select-route="BKK-TPE"]')).toBeInTheDocument());
  fireEvent.click(document.querySelector('[data-select-route="BKK-TPE"]')!);
  expect(document.querySelector('[data-verify-live-carrier="BR:BKK-TPE"]')).toBeInTheDocument();
  expect(document.querySelector('[data-select-flight-later="BR:BKK-TPE"]')).toBeNull();
  expect(document.querySelector('[data-add-draft="BR:BKK-TPE"]')).toBeNull();
  expect(onAddPair).not.toHaveBeenCalled();
});

test('static confirmed routes remain available when live discovery is unavailable', async () => {
  const fetchImpl = vi.fn(async () => new Response('{"error":"unavailable"}', { status: 503 }));
  vi.stubGlobal('fetch', fetchImpl);
  const staticNetwork = RouteNetworkCatalogSchema.parse({
    version: '2026.3',
    coverage: 'curated-not-complete',
    sources: [{ id: 'eva-confirmed', url: 'https://www.evaair.com/', checkedOn: '2026-09-08', note: 'Confirmed EVA route evidence.' }],
    carrierUniverses: [],
    routes: [{ carrier: 'BR', pair: ['TPE', 'BKK'], service: 'nonstop', status: 'published', sourceIds: ['eva-confirmed'] }],
  });
  render(<DestinationsPanel
    airports={airports}
    schedules={[]}
    carriers={[{ code: 'BR', name: 'EVA Air' }]}
    lookupAirport={(iata) => airports.find((airport) => airport.iata === iata)}
    network={staticNetwork}
    pendingIata="TPE"
    liveApiBase="/api"
  />);

  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  expect(document.querySelector('[data-select-route="TPE-BKK"]')).toBeInTheDocument();
  fireEvent.click(document.querySelector('[data-select-route="TPE-BKK"]')!);
  expect(document.querySelector('[data-select-flight-later="BR:TPE-BKK"]')).toBeInTheDocument();
  expect(document.querySelector('[data-verify-live-carrier="BR:TPE-BKK"]')).toBeNull();
});
