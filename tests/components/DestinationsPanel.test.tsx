import { describe, expect, test, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ScheduleEntry } from '../../src/lib/schemas/flight-schedules.ts';
import { DestinationsPanel } from '../../src/components/DestinationsPanel.tsx';

afterEach(cleanup);

function entry(overrides: Partial<ScheduleEntry> & Pick<ScheduleEntry, 'carrier' | 'pair'>): ScheduleEntry {
  return {
    daysOfWeek: [1, 4],
    status: 'operating',
    confidence: 'chart-verified',
    sourceUrls: ['https://example.com/timetable'],
    ...overrides,
  };
}

const airports = new Map(
  [
    { iata: 'TPE', name: 'Taoyuan', city: 'Taipei', country: 'TW', lat: 25.08, lon: 121.23 },
    { iata: 'LHR', name: 'Heathrow', city: 'London', country: 'GB', lat: 51.47, lon: -0.45 },
    { iata: 'CDG', name: 'CDG', city: 'Paris', country: 'FR', lat: 49.01, lon: 2.55 },
    { iata: 'YVR', name: 'Vancouver', city: 'Vancouver', country: 'CA', lat: 49.19, lon: -123.18 },
    { iata: 'KIX', name: 'Kansai', city: 'Osaka', country: 'JP', lat: 34.43, lon: 135.24 },
    { iata: 'NRT', name: 'Narita', city: 'Tokyo', country: 'JP', lat: 35.77, lon: 140.39 },
  ].map((a) => [a.iata, a]),
);

const carriers = [
  { code: 'BR', name: 'EVA Air' },
  { code: 'CX', name: 'Cathay Pacific' },
];

const brEntries: ScheduleEntry[] = [
  entry({ carrier: 'BR', pair: ['TPE', 'LHR'] }),
  entry({ carrier: 'BR', pair: ['TPE', 'CDG'] }),
  entry({ carrier: 'BR', pair: ['TPE', 'YVR'], confidence: 'community-corrected' }),
  entry({ carrier: 'BR', pair: ['KHH', 'KIX'] }),
];

describe('DestinationsPanel', () => {
  test('lists known origins and destinations for a covered carrier', () => {
    render(
      <DestinationsPanel
        schedules={brEntries}
        carriers={carriers}
        lookupAirport={(iata) => airports.get(iata)}
        onAddPair={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Known nonstops' })).toBeInTheDocument();
    // TPE sorts first; destinations alphabetical with city names resolved.
    expect(screen.getByRole('button', { name: 'TPE→CDG · Paris' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TPE→LHR · London' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TPE→YVR · Vancouver' })).toBeInTheDocument();
  });

  test('clicking an enabled chip emits the ordered pair', () => {
    const onAddPair = vi.fn();
    render(
      <DestinationsPanel
        schedules={brEntries}
        carriers={carriers}
        lookupAirport={(iata) => airports.get(iata)}
        onAddPair={onAddPair}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'TPE→LHR · London' }));
    expect(onAddPair).toHaveBeenCalledWith('TPE', 'LHR');
  });

  test('chips that cannot attach to the chain end are disabled with a hint', () => {
    const onAddPair = vi.fn();
    render(
      <DestinationsPanel
        schedules={brEntries}
        carriers={carriers}
        chainEnd="KHH"
        lookupAirport={(iata) => airports.get(iata)}
        onAddPair={onAddPair}
      />,
    );

    // Auto-origin follows the chain end when that airport is itself an
    // origin in the catalog (KHH→KIX exists): clickable and emits the pair.
    fireEvent.click(screen.getByRole('button', { name: 'KHH→KIX · Osaka' }));
    expect(onAddPair).toHaveBeenCalledWith('KHH', 'KIX');

    // Switch to TPE origin: those chips disable, hinting at the chain end.
    fireEvent.click(screen.getByRole('button', { name: 'TPE' }));
    const lhr = screen.getByRole('button', { name: 'TPE→LHR · London' });
    expect(lhr).toBeDisabled();
    expect(lhr.getAttribute('title')).toContain('KHH');
  });

  test('pending airport gates the same way as a chain end', () => {
    render(
      <DestinationsPanel
        schedules={brEntries}
        carriers={carriers}
        pendingIata="KHH"
        lookupAirport={(iata) => airports.get(iata)}
        onAddPair={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'KHH→KIX · Osaka' })).toBeEnabled();
  });

  test('a carrier without catalog rows shows the honest empty note', () => {
    render(
      <DestinationsPanel
        schedules={brEntries}
        carriers={carriers}
        defaultCarrier="CX"
        lookupAirport={(iata) => airports.get(iata)}
        onAddPair={vi.fn()}
      />,
    );

    expect(screen.getByText(/No schedule-catalog rows for Cathay Pacific/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /LHR/ })).not.toBeInTheDocument();
  });

  test('geo maps tier destinations continent → subregion → country → chips', () => {
    const continents = new Map([
      ['GB', 'europe'],
      ['FR', 'europe'],
      ['JP', 'asia'],
      ['TH', 'asia'],
    ]);
    const subregions = new Map([
      ['JP', 'northeast-asia'],
      ['TH', 'southeast-asia'],
      ['GB', 'western-europe'],
    ]);
    const entries: ScheduleEntry[] = [
      entry({ carrier: 'BR', pair: ['TPE', 'LHR'] }),
      entry({ carrier: 'BR', pair: ['TPE', 'NRT'] }),
      entry({ carrier: 'BR', pair: ['KHH', 'KIX'] }),
    ];

    render(
      <DestinationsPanel
        schedules={entries}
        carriers={[carriers[0]!]}
        lookupAirport={(iata) => airports.get(iata)}
        countryContinents={continents}
        countrySubregions={subregions}
        onAddPair={vi.fn()}
      />,
    );

    // Continent heading + subregion + country tiers all render.
    expect(screen.getByText('Asia')).toBeInTheDocument();
    expect(screen.getByText('Europe')).toBeInTheDocument();
    expect(screen.getByText('Northeast Asia')).toBeInTheDocument();
    // TW-origin auto-active: Japan group shows NRT; Taiwan country opens by default.
    expect(screen.getByText('Japan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TPE→NRT · Tokyo' })).toBeInTheDocument();
  });

  test('without geo maps the flat chip row still renders', () => {
    render(
      <DestinationsPanel
        schedules={brEntries}
        carriers={carriers}
        lookupAirport={(iata) => airports.get(iata)}
        onAddPair={vi.fn()}
      />,
    );
    expect(screen.queryByText('Asia')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TPE→LHR · London' })).toBeInTheDocument();
  });
});
