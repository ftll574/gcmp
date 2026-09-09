import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test } from 'vitest';
import { RouteCatalogBrowser } from '../../src/components/RouteCatalogBrowser.tsx';
import type { RouteNetworkCatalog } from '../../src/lib/schemas/route-network.ts';
import type { Airport } from '../../src/lib/types.ts';
import type { RouteBrowserOfficialCatalog } from '../../src/lib/rtw/route-catalog-browser.ts';

afterEach(cleanup);

const airports = new Map<string, Airport>([
  ['TPE', { iata: 'TPE', name: 'Taiwan Taoyuan', city: 'Taoyuan', country: 'TW', lat: 25, lon: 121 }],
  ['BKK', { iata: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'TH', lat: 14, lon: 101 }],
]);

const routeNetwork: RouteNetworkCatalog = {
  version: '2026.3', coverage: 'curated-not-complete', carrierUniverses: [],
  sources: [
    { id: 'routes', url: 'https://example.com/routes', checkedOn: '2026-09-08', note: 'Route source' },
    { id: 'numbers', url: 'https://example.com/numbers', checkedOn: '2026-09-09', note: 'Candidate flight-number source' },
  ],
  routes: [{
    carrier: 'BR', pair: ['TPE', 'BKK'], service: 'nonstop', status: 'published', sourceIds: ['routes'],
    flightNumberCandidates: ['BR75'], flightNumberCandidateSourceIds: ['numbers'],
  }],
};

const officialSchedules: RouteBrowserOfficialCatalog = {
  sources: {
    eva: {
      name: 'EVA timetable', url: 'https://example.com/eva', checkedAt: '2026-09-08T00:00:00.000Z',
    },
  },
  services: [{
    id: 'br67', carrier: 'BR', flightNumber: '67', from: 'TPE', to: 'BKK',
    effectiveFrom: '2026-09-08', effectiveUntil: '2026-09-08', daysOfWeek: [],
    addedDates: ['2026-09-08'], departureTime: '08:15', arrivalTime: '11:20',
    arrivalDayOffset: 0, sourceId: 'eva',
  }],
  flightNumberReferences: [],
};

function setup() {
  return render(
    <RouteCatalogBrowser
      routeNetwork={routeNetwork}
      schedules={[]}
      officialSchedules={officialSchedules}
      memberCodes={new Set(['BR'])}
      airports={airports}
      countryContinents={new Map([['TW', 'asia'], ['TH', 'asia']])}
    />,
  );
}

function toggle(details: HTMLDetailsElement): void {
  details.open = true;
  fireEvent(details, new Event('toggle'));
}

test('mounts route and flight details progressively instead of printing the full catalog at once', () => {
  setup();
  expect(document.querySelector('[data-continent="asia"]')).toBeInTheDocument();
  expect(document.querySelector('[data-airport="TPE"]')).toBeNull();
  expect(screen.queryByText('BR67')).not.toBeInTheDocument();

  toggle(document.querySelector<HTMLDetailsElement>('[data-continent="asia"]')!);
  expect(document.querySelector('[data-country="TW"]')).toBeInTheDocument();
  expect(document.querySelector('[data-airport="TPE"]')).toBeNull();

  toggle(document.querySelector<HTMLDetailsElement>('[data-country="TW"]')!);
  expect(document.querySelector('[data-airport="TPE"]')).toBeInTheDocument();
  expect(document.querySelector('[data-route="TPE-BKK"]')).toBeNull();

  toggle(document.querySelector<HTMLDetailsElement>('[data-airport="TPE"]')!);
  expect(document.querySelector('[data-route="TPE-BKK"]')).toBeInTheDocument();
  expect(document.querySelector('[data-carrier="BR"]')).toBeNull();

  toggle(document.querySelector<HTMLDetailsElement>('[data-route="TPE-BKK"]')!);
  expect(document.querySelector('[data-carrier="BR"]')).toBeInTheDocument();
  expect(screen.queryByText('BR67')).not.toBeInTheDocument();

  toggle(document.querySelector<HTMLDetailsElement>('[data-carrier="BR"]')!);
  expect(screen.getByText('BR67')).toBeInTheDocument();
  expect(screen.getByText('Known flight numbers')).toBeInTheDocument();
  expect(screen.getByText('BR75')).toBeInTheDocument();
  expect(screen.getByText('Candidate flight numbers')).toBeInTheDocument();
  expect(screen.queryByText('08:15 → 11:20')).not.toBeInTheDocument();

  toggle(document.querySelector<HTMLDetailsElement>('.route-browser-evidence')!);
  expect(screen.getByText('08:15 → 11:20')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'EVA timetable' })).toHaveAttribute('href', 'https://example.com/eva');
});

test('can regroup the same directional routes by destination', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Group by destination' }));
  toggle(document.querySelector<HTMLDetailsElement>('[data-continent="asia"]')!);
  expect(document.querySelector('[data-country="TH"]')).toBeInTheDocument();
  expect(document.querySelector('[data-airport="BKK"]')).toBeNull();
  toggle(document.querySelector<HTMLDetailsElement>('[data-country="TH"]')!);
  expect(document.querySelector('[data-airport="BKK"]')).toBeInTheDocument();
  expect(document.querySelector('[data-airport="TPE"]')).toBeNull();
});
