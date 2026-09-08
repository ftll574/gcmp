import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { MapView } from '../../src/components/MapView.tsx';
import type { NextLegMapGuide } from '../../src/lib/rtw/next-leg-discovery.ts';
import type { Airport, RoutingGroup } from '../../src/lib/types.ts';

vi.mock('../../src/state/use-world-map.ts', () => ({
  useWorldMap: () => ({ features: null, error: null }),
}));

afterEach(cleanup);

const AIRPORTS: Airport[] = [
  { iata: 'TPE', name: 'Taiwan Taoyuan', city: 'Taoyuan', country: 'TW', lat: 25.08, lon: 121.23 },
  { iata: 'HKG', name: 'Hong Kong', city: 'Hong Kong', country: 'HK', lat: 22.31, lon: 113.92 },
  { iata: 'LHR', name: 'Heathrow', city: 'London', country: 'GB', lat: 51.47, lon: -0.45 },
  { iata: 'NRT', name: 'Narita', city: 'Tokyo', country: 'JP', lat: 35.77, lon: 140.39 },
  { iata: 'LAX', name: 'Los Angeles', city: 'Los Angeles', country: 'US', lat: 33.94, lon: -118.41 },
  { iata: 'SIN', name: 'Changi', city: 'Singapore', country: 'SG', lat: 1.36, lon: 103.99 },
];

const airportLookup = new Map(AIRPORTS.map((airport) => [airport.iata, airport] as const));
const activeAirports = [AIRPORTS[0]!, AIRPORTS[1]!, AIRPORTS[2]!, AIRPORTS[0]!];
const groups: RoutingGroup[] = [
  {
    legs: [
      { from: 'TPE', to: 'HKG', operatingCarrier: 'CX' },
      { from: 'HKG', to: 'LHR', operatingCarrier: 'CX' },
      { from: 'LHR', to: 'TPE', operatingCarrier: 'CX' },
    ],
  },
  { legs: [{ from: 'NRT', to: 'LAX', operatingCarrier: 'JL' }] },
];

function setup(
  showDistances = true,
  projection: 'mercator' | 'azimuthal-equidistant' = 'azimuthal-equidistant',
  nextLegGuide: NextLegMapGuide | null = null,
  onNextLegSelect = vi.fn(),
  selectedNextStop: string | null | undefined = undefined,
  groupsOverride: ReadonlyArray<RoutingGroup> = groups,
  activeAirportsOverride: ReadonlyArray<Airport> = activeAirports,
) {
  const result = render(
    <MapView
      airportLookup={airportLookup}
      airports={AIRPORTS}
      activeAirports={activeAirportsOverride}
      groups={groupsOverride}
      activeIndex={0}
      width={800}
      height={500}
      projection={projection}
      showDistances={showDistances}
      nextLegGuide={nextLegGuide}
      onNextLegSelect={onNextLegSelect}
      selectedNextStop={selectedNextStop}
    />,
  );
  const svg = result.container.querySelector<SVGSVGElement>('svg.map-view')!;
  Object.defineProperty(svg, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 500,
      width: 800, height: 500, toJSON: () => ({}),
    }),
  });
  return { ...result, svg, onNextLegSelect };
}

test('Mercator uses the true projected 360-degree period instead of viewport width', () => {
  setup(false, 'mercator');
  const offsets = [...document.querySelectorAll<SVGGElement>('[data-map-world-copy="true"]')]
    .map((node) => Number(node.dataset.mapWrapOffset))
    .sort((a, b) => a - b);
  const positive = offsets.find((offset) => offset > 0);
  expect(positive).toBeDefined();
  // 800×500 Mercator is height-constrained, so the world period is ~500px,
  // not the 800px viewport width. Using 800 creates the visible Pacific gap.
  expect(positive).toBeCloseTo(500, 3);
  expect(positive).not.toBeCloseTo(800, 0);
});

test('wrapping projections render enough copies to cover zoomed-out views', () => {
  const { svg } = setup(false, 'mercator');
  fireEvent.wheel(svg, { deltaY: 1000, clientX: 400, clientY: 250 });
  expect(document.querySelectorAll('[data-map-world-copy="true"]').length).toBeGreaterThanOrEqual(5);
});

test('default world scale prioritizes the route and hides the global airport cloud', () => {
  setup();
  expect(document.querySelector('.map-airport-dots')).toBeNull();
  expect(screen.getByText('1/4 TPE')).toBeInTheDocument();
  expect(screen.getByText('2 HKG')).toBeInTheDocument();
  expect(screen.getByText('3 LHR')).toBeInTheDocument();
  expect(screen.queryByText('NRT')).not.toBeInTheDocument();
});

test('active route stays above contextual groups and owns distance labels', () => {
  setup();
  expect(document.querySelectorAll('.map-arc-active')).toHaveLength(3);
  expect(document.querySelectorAll('.map-arc-halo')).toHaveLength(3);
  expect(document.querySelectorAll('.map-arc-inactive')).toHaveLength(1);
  expect(document.querySelectorAll('.map-distance-badge')).toHaveLength(3);
});

test('surface sectors use a distinct ground-transfer path and never masquerade as flight arcs or distance badges', () => {
  const surfaceGroups: RoutingGroup[] = [{
    legs: [
      { from: 'TPE', to: 'HKG', operatingCarrier: 'CX' },
      { from: 'HKG', to: 'NRT', surface: true },
    ],
  }];
  setup(
    true,
    'azimuthal-equidistant',
    null,
    vi.fn(),
    undefined,
    surfaceGroups,
    [AIRPORTS[0]!, AIRPORTS[1]!, AIRPORTS[3]!],
  );

  expect(document.querySelectorAll('.map-arc-active')).toHaveLength(1);
  expect(document.querySelectorAll('.map-arc-halo')).toHaveLength(1);
  const surface = document.querySelector('[data-map-surface="HKG-NRT"]');
  expect(surface).toBeInTheDocument();
  expect(surface).toHaveClass('map-arc-surface', 'active');
  expect(surface).not.toHaveClass('map-arc-active');
  expect(document.querySelectorAll('.map-distance-badge')).toHaveLength(1);
});

test('zooming into detail reveals background airports without changing route hierarchy', () => {
  const { svg } = setup(false);
  fireEvent.wheel(svg, { deltaY: -1000, clientX: 400, clientY: 250 });
  expect(document.querySelector('.map-airport-dots')).toBeInTheDocument();
  expect(screen.getByText('NRT')).toBeInTheDocument();
  expect(document.querySelectorAll('.map-arc-active')).toHaveLength(3);
  expect(document.querySelectorAll('.map-arc-inactive')).toHaveLength(1);
});

test('waypoint labels are staggered around dense route points', () => {
  setup(false);
  const placements = [...document.querySelectorAll<SVGGElement>('.map-waypoint-label')]
    .map((node) => node.dataset.placement);
  expect(new Set(placements).size).toBeGreaterThan(1);
});

test('next-leg guide keeps the typed origin visible, previews a sourced stop, and shows flight-number hints without bypassing the route panel', () => {
  const guide: NextLegMapGuide = {
    origin: 'TPE',
    destinations: [
      {
        iata: 'NRT',
        options: [{
          carrier: 'JL', from: 'TPE', to: 'NRT', scheduleStatus: 'covered',
          flightNumbers: ['JL002'],
          networkSources: [], schedules: [], routeWindow: null,
        }],
      },
      {
        iata: 'LAX',
        options: [{
          carrier: 'BR', from: 'TPE', to: 'LAX', scheduleStatus: 'unknown',
          flightNumbers: [],
          networkSources: [], schedules: [], routeWindow: null,
        }],
      },
    ],
  };
  const onNextLegSelect = vi.fn();
  setup(false, 'azimuthal-equidistant', guide, onNextLegSelect);

  expect(document.querySelector('.map-next-leg-veil')).toBeInTheDocument();
  expect(document.querySelector('[data-next-leg-origin="TPE"]')).toBeInTheDocument();
  expect(document.querySelectorAll('[data-next-stop="NRT"]')).toHaveLength(1);
  expect(document.querySelectorAll('[data-next-stop="LAX"]')).toHaveLength(1);
  expect(document.querySelector('[data-next-stop="LAX"]')).toHaveClass('needs-check');
  expect(document.querySelector('.map-airport-dots')).toBeNull();

  fireEvent.click(document.querySelector('[data-next-stop="NRT"]')!);
  expect(onNextLegSelect).toHaveBeenCalledWith('NRT');
  expect(document.querySelector('[data-next-stop-preview="TPE-NRT"]')).toBeInTheDocument();
  expect(screen.getByText('JL002')).toBeInTheDocument();
  expect(document.querySelector('[data-map-add-route]')).toBeNull();
  expect(screen.getByText('Select flight number in the route panel')).toBeInTheDocument();
});

test('a stale guide whose origin is not the current endpoint never paints availability', () => {
  const guide: NextLegMapGuide = {
    origin: 'HKG',
    destinations: [{
      iata: 'NRT',
      options: [{
        carrier: 'JL', from: 'HKG', to: 'NRT', scheduleStatus: 'covered',
        flightNumbers: ['JL736'],
        networkSources: [], schedules: [], routeWindow: null,
      }],
    }],
  };
  setup(false, 'azimuthal-equidistant', guide);
  expect(document.querySelector('.map-next-leg-veil')).toBeNull();
  expect(document.querySelector('[data-next-stop]')).toBeNull();
});

test('dense next-leg networks cluster at overview and expand toward detail on click', async () => {
  const denseAirports: Airport[] = [
    ...AIRPORTS,
    ...Array.from({ length: 13 }, (_, index) => ({
      iata: `D${String(index).padStart(2, '0')}`,
      name: `Dense ${index}`,
      city: `Dense ${index}`,
      country: 'TW',
      lat: 24.8 + (index % 4) * 0.08,
      lon: 120.8 + Math.floor(index / 4) * 0.08,
    })),
  ];
  const denseLookup = new Map(denseAirports.map((airport) => [airport.iata, airport] as const));
  const denseGuide: NextLegMapGuide = {
    origin: 'TPE',
    destinations: denseAirports.slice(AIRPORTS.length).map((airport) => ({
      iata: airport.iata,
      options: [{
        carrier: 'BR', from: 'TPE', to: airport.iata, scheduleStatus: 'unknown',
        flightNumbers: [], networkSources: [], schedules: [], routeWindow: null,
      }],
    })),
  };
  const denseGroups: RoutingGroup[] = [{
    legs: [{ from: 'HKG', to: 'TPE', operatingCarrier: 'BR' }],
  }];
  const result = render(
    <MapView
      airportLookup={denseLookup}
      airports={denseAirports}
      activeAirports={[AIRPORTS[1]!, AIRPORTS[0]!]}
      groups={denseGroups}
      activeIndex={0}
      width={800}
      height={500}
      projection="mercator"
      nextLegGuide={denseGuide}
    />,
  );
  expect(result.container.querySelector('svg.map-view')).toHaveAttribute('data-map-fit', 'network');
  expect(result.container.querySelector('svg.map-view')).toHaveAttribute('data-map-detail', 'overview');
  expect(result.container.querySelector('.map-next-stop-cluster')).toBeInTheDocument();
  expect(result.container.querySelectorAll('[data-next-stop]').length).toBeLessThan(13);
  fireEvent.click(result.container.querySelector('.map-next-stop-cluster')!);
  await waitFor(() => {
    expect(result.container.querySelector('.map-reset-btn-group')).toBeInTheDocument();
    expect(result.container.querySelector('svg.map-view')).toHaveAttribute('data-map-detail', 'regional');
  });
});

test('selected next stop remains individual even when nearby points are clustered', async () => {
  const nearby: Airport[] = [
    ...AIRPORTS,
    { iata: 'TSA', name: 'Songshan', city: 'Taipei', country: 'TW', lat: 25.07, lon: 121.55 },
    { iata: 'RMQ', name: 'Taichung', city: 'Taichung', country: 'TW', lat: 24.26, lon: 120.62 },
  ];
  const lookup = new Map(nearby.map((airport) => [airport.iata, airport] as const));
  const guide: NextLegMapGuide = {
    origin: 'TPE',
    destinations: ['TSA', 'RMQ', 'NRT'].map((iata) => ({
      iata,
      options: [{
        carrier: 'BR', from: 'TPE', to: iata, scheduleStatus: 'unknown',
        flightNumbers: [], networkSources: [], schedules: [], routeWindow: null,
      }],
    })),
  };
  const result = render(
    <MapView
      airportLookup={lookup}
      airports={nearby}
      activeAirports={[AIRPORTS[1]!, AIRPORTS[0]!]}
      groups={[{ legs: [{ from: 'HKG', to: 'TPE', operatingCarrier: 'BR' }] }]}
      activeIndex={0}
      width={800}
      height={500}
      projection="mercator"
      nextLegGuide={guide}
      selectedNextStop="TSA"
    />,
  );
  await waitFor(() => {
    expect(result.container.querySelector('[data-next-stop="TSA"]')).toBeInTheDocument();
    expect(result.container.querySelector('svg.map-view')).toHaveAttribute('data-map-fit', 'selection');
  });
  expect(result.container.querySelector('[data-next-stop="TSA"]')).toHaveClass('selected');
  expect(result.container.querySelector('[data-next-stop-preview="TPE-TSA"]')).toBeInTheDocument();
});
