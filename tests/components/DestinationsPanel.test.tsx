import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ScheduleEntry } from '../../src/lib/schemas/flight-schedules.ts';
import { RouteNetworkCatalogSchema } from '../../src/lib/schemas/route-network.ts';
import { OfficialScheduleCatalogSchema } from '../../src/lib/schemas/published-schedules.ts';
import { DestinationsPanel } from '../../src/components/DestinationsPanel.tsx';
import { readFileSync } from 'node:fs';

afterEach(cleanup);

function entry(overrides: Partial<ScheduleEntry> & Pick<ScheduleEntry, 'carrier' | 'pair'>): ScheduleEntry {
  return {
    daysOfWeek: [1, 4], status: 'operating', confidence: 'chart-verified',
    sourceUrls: ['https://example.com/timetable'], ...overrides,
  };
}

const airports = new Map([
  { iata: 'TPE', name: 'Taoyuan', city: 'Taipei', country: 'TW', lat: 25.08, lon: 121.23 },
  { iata: 'TSA', name: 'Songshan', city: 'Taipei (Songshan)', country: 'TW', lat: 25.07, lon: 121.55 },
  { iata: 'SEA', name: 'Seattle Tacoma', city: 'Seattle', country: 'US', lat: 47.45, lon: -122.31 },
  { iata: 'LHR', name: 'Heathrow', city: 'London', country: 'GB', lat: 51.47, lon: -0.45 },
  { iata: 'CDG', name: 'CDG', city: 'Paris', country: 'FR', lat: 49.01, lon: 2.55 },
  { iata: 'NRT', name: 'Narita', city: 'Narita', country: 'JP', lat: 35.77, lon: 140.39 },
  { iata: 'HND', name: 'Haneda', city: 'Tokyo', country: 'JP', lat: 35.55, lon: 139.78 },
  { iata: 'SIN', name: 'Changi', city: 'Singapore', country: 'SG', lat: 1.36, lon: 103.99 },
].map((airport) => [airport.iata, airport]));

const carriers = [{ code: 'BR', name: 'EVA Air' }, { code: 'CX', name: 'Cathay Pacific' }];
const schedules = [
  entry({ carrier: 'BR', pair: ['TPE', 'SEA'], flightNumbers: ['BR024', 'BR026'] }),
  entry({ carrier: 'BR', pair: ['TPE', 'LHR'], flightNumbers: ['BR067'] }),
  entry({ carrier: 'BR', pair: ['TPE', 'CDG'], flightNumbers: ['BR087'] }),
];
const officialSchedules = OfficialScheduleCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/official-schedules.json', 'utf8')),
);
const baseProps = {
  airports: [...airports.values()], schedules, officialSchedules, carriers,
  lookupAirport: (iata: string) => airports.get(iata),
  onAddPair: vi.fn(),
  onAddSurface: vi.fn(),
};

function pair(from: string, to: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^${from}→${to}`) });
}
function selectPair(from: string, to: string): void { fireEvent.click(pair(from, to)); }
function flight(designator: string, from = 'TPE', to = 'SEA'): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`[data-select-flight-number="${designator}:${from}-${to}"]`);
  if (!button) throw new Error(`Missing flight ${designator}`);
  return button;
}

describe('DestinationsPanel · nonblocking next-leg workflow', () => {
  test('requires an explicit route endpoint and never defaults to TPE', () => {
    const onMapGuideChange = vi.fn();
    render(<DestinationsPanel {...baseProps} onMapGuideChange={onMapGuideChange} />);
    expect(screen.getByText(/Add a starting airport above/)).toBeInTheDocument();
    expect(document.querySelector('.rtw-next-origin')).toBeNull();
    expect(document.querySelector('[data-select-route]')).toBeNull();
    expect(onMapGuideChange).toHaveBeenLastCalledWith(null);
  });

  test('makes a selected airport pair the primary card instead of leaving it in the middle of candidates', () => {
    render(<DestinationsPanel {...baseProps} pendingIata="TPE" />);
    expect(pair('TPE', 'SEA')).toHaveTextContent('Seattle');
    expect(pair('TPE', 'LHR')).toBeInTheDocument();
    selectPair('TPE', 'SEA');
    const card = document.querySelector('[data-selected-route="TPE-SEA"]');
    expect(card).toHaveTextContent('TPE→SEA');
    expect(screen.getByRole('button', { name: 'Choose another airport' })).toBeInTheDocument();
    expect(document.querySelector('[data-select-route="TPE-LHR"]')).toBeNull();
  });

  test('TPE → SEA exposes BR024 / BR026 before cabin or timing controls', () => {
    render(<DestinationsPanel {...baseProps} pendingIata="TPE" />);
    selectPair('TPE', 'SEA');
    expect(flight('BR024')).toBeInTheDocument();
    expect(flight('BR026')).toBeInTheDocument();
    expect(document.querySelector('[data-next-leg-cabin="TPE-SEA"]')).toBeNull();
    expect(document.querySelector('[data-open-flight-dates="TPE-SEA"]')).toBeNull();
  });

  test('bundled official reference exposes SQ877 for TPE → SIN before a dated timetable is known', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-07T12:46:00Z'));
    try {
      render(<DestinationsPanel
        {...baseProps}
        schedules={[]}
        carriers={[{ code: 'SQ', name: 'Singapore Airlines' }]}
        pendingIata="TPE"
      />);
      selectPair('TPE', 'SIN');
      expect(flight('SQ877', 'TPE', 'SIN')).toBeInTheDocument();
      expect(flight('SQ877', 'TPE', 'SIN')).toHaveTextContent('Route recorded · schedule unverified');
      expect(document.querySelector('.rtw-explorer-evidence')).toHaveTextContent('Official flight-number reference');
      expect(document.querySelector('.rtw-explorer-evidence')).toHaveTextContent('singaporeair.com');
    } finally {
      vi.useRealTimers();
    }
  });

  test('selecting BR024 reveals cabin and date/time steps without adding the leg yet', () => {
    const onAddPair = vi.fn();
    render(<DestinationsPanel {...baseProps} pendingIata="TPE" onAddPair={onAddPair} />);
    selectPair('TPE', 'SEA'); fireEvent.click(flight('BR024'));
    expect(flight('BR024')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-next-leg-cabin="TPE-SEA"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Check dates & times for BR024' })).toBeInTheDocument();
    expect(onAddPair).not.toHaveBeenCalled();
  });

  test('can persist chosen flight number and cabin before choosing a date', () => {
    const onAddPair = vi.fn();
    render(<DestinationsPanel {...baseProps} pendingIata="TPE" onAddPair={onAddPair} />);
    selectPair('TPE', 'SEA'); fireEvent.click(flight('BR024'));
    fireEvent.change(document.querySelector('[data-next-leg-cabin="TPE-SEA"]')!, { target: { value: 'business' } });
    fireEvent.click(document.querySelector('[data-add-selected-flight="BR024:TPE-SEA"]')!);
    expect(onAddPair).toHaveBeenCalledWith('TPE', 'SEA', 'BR', { flightNumber: '024', cabin: 'business' });
  });

  test('choose another airport returns to sourced candidates', () => {
    render(<DestinationsPanel {...baseProps} pendingIata="TPE" />);
    selectPair('TPE', 'SEA');
    fireEvent.click(screen.getByRole('button', { name: 'Choose another airport' }));
    expect(document.querySelector('[data-selected-route="TPE-SEA"]')).toBeNull();
    expect(pair('TPE', 'LHR')).toBeInTheDocument();
  });

  test('destination search filters both list and map guide without changing origin', async () => {
    const onMapGuideChange = vi.fn();
    render(<DestinationsPanel {...baseProps} pendingIata="TPE" onMapGuideChange={onMapGuideChange} />);
    fireEvent.change(screen.getByLabelText('Find a destination'), { target: { value: 'Seattle' } });
    expect(pair('TPE', 'SEA')).toBeInTheDocument();
    expect(document.querySelector('[data-select-route="TPE-LHR"]')).toBeNull();
    expect(document.querySelector('.rtw-next-origin')).toHaveAttribute('data-origin', 'TPE');
    await waitFor(() => {
      const latest = onMapGuideChange.mock.calls.at(-1)?.[0];
      expect(latest?.destinations.map((destination: { iata: string }) => destination.iata)).toEqual(['SEA']);
    });
  });

  test('network-only exact route is honest when no flight number is cataloged', () => {
    const network = RouteNetworkCatalogSchema.parse({
      version: '2026.3', coverage: 'curated-not-complete',
      sources: [{ id: 'fixture', url: 'https://example.com/route', checkedOn: '2026-09-05', note: 'Fixture.' }],
      routes: [{ carrier: 'CX', pair: ['TPE', 'LHR'], service: 'nonstop', status: 'published', sourceIds: ['fixture'] }],
    });
    render(<DestinationsPanel {...baseProps} schedules={[]} network={network} pendingIata="TPE" />);
    selectPair('TPE', 'LHR');
    expect(screen.getByText('Flight number not cataloged yet')).toBeInTheDocument();
    expect(document.querySelector('[data-select-flight-number]')).toBeNull();
    expect(document.querySelector('[data-select-flight-later="CX:TPE-LHR"]')).toBeInTheDocument();
    expect(document.querySelector('.rtw-explorer-evidence')).toHaveTextContent('Source checked 2026-09-05');
  });

  test('missing flight number never blocks planning: airline-only draft can set transfer and add', () => {
    const onAddPair = vi.fn();
    const network = RouteNetworkCatalogSchema.parse({
      version: '2026.3', coverage: 'curated-not-complete',
      sources: [{ id: 'fixture', url: 'https://example.com/route', checkedOn: '2026-09-05', note: 'Fixture.' }],
      routes: [{ carrier: 'CX', pair: ['TPE', 'LHR'], service: 'nonstop', status: 'published', sourceIds: ['fixture'] }],
    });
    render(<DestinationsPanel {...baseProps} onAddPair={onAddPair} schedules={[]} network={network} pendingIata="TPE" />);
    selectPair('TPE', 'LHR');
    fireEvent.click(document.querySelector('[data-select-flight-later="CX:TPE-LHR"]')!);
    const timing = document.querySelector<HTMLSelectElement>('[data-next-leg-timing="TPE-LHR"]')!;
    expect(timing).toBeInTheDocument();
    fireEvent.change(timing, { target: { value: 'transfer' } });
    expect(document.querySelector('[data-next-leg-cabin="TPE-LHR"]')).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-add-draft="CX:TPE-LHR"]')!);
    expect(onAddPair).toHaveBeenCalledWith('TPE', 'LHR', 'CX', { stopover: false });
  });

  test('known schedules still allow choosing airline now and flight number later', () => {
    const onAddPair = vi.fn();
    render(<DestinationsPanel {...baseProps} onAddPair={onAddPair} pendingIata="TPE" />);
    selectPair('TPE', 'SEA');
    fireEvent.click(document.querySelector('[data-select-flight-later="BR:TPE-SEA"]')!);
    expect(document.querySelector('[data-next-leg-timing="TPE-SEA"]')).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-add-draft="BR:TPE-SEA"]')!);
    expect(onAddPair).toHaveBeenCalledWith('TPE', 'SEA', 'BR', {});
  });

  test('metropolitan airport changes use TYO grouping even when airport city strings differ', () => {
    const onAddSurface = vi.fn();
    render(<DestinationsPanel {...baseProps} onAddSurface={onAddSurface} chainEnd="NRT" />);
    const change = document.querySelector<HTMLButtonElement>('[data-select-surface="NRT-HND"]');
    expect(change).toBeInTheDocument();
    fireEvent.click(change!);
    expect(document.querySelector('[data-selected-surface="NRT-HND"]')).toHaveTextContent('NRT⇢HND');
    fireEvent.change(document.querySelector('[data-surface-timing="NRT-HND"]')!, { target: { value: 'transfer' } });
    fireEvent.click(document.querySelector('[data-add-surface="NRT-HND"]')!);
    expect(onAddSurface).toHaveBeenCalledWith('NRT', 'HND', false);
  });

  test('Taipei TPE → TSA is offered as an airport change despite different municipality strings', () => {
    render(<DestinationsPanel {...baseProps} pendingIata="TPE" />);
    expect(document.querySelector('[data-select-surface="TPE-TSA"]')).toBeInTheDocument();
  });

  test('expired schedule keeps its sourced flight number but not current-coverage styling', () => {
    const expired = entry({ carrier: 'BR', pair: ['TPE', 'SEA'], flightNumbers: ['BR024'], effectiveFrom: '2025-01-01', effectiveUntil: '2025-03-29' });
    render(<DestinationsPanel {...baseProps} schedules={[expired]} pendingIata="TPE" />);
    const details = document.querySelector<HTMLDetailsElement>('.rtw-next-advanced')!;
    fireEvent.click(details.querySelector('summary')!);
    fireEvent.change(screen.getByLabelText('Check catalog coverage on'), { target: { value: '2026-09-05' } });
    selectPair('TPE', 'SEA');
    expect(flight('BR024')).toHaveTextContent('Outside observed window');
  });

  test('uncovered endpoint never falls back to another hub', () => {
    render(<DestinationsPanel {...baseProps} chainEnd="NRT" />);
    expect(document.querySelector('.rtw-next-origin')).toHaveAttribute('data-origin', 'NRT');
    expect(screen.getByText(/No sourced onward routes are recorded from NRT/)).toBeInTheDocument();
    expect(document.querySelector('[data-select-route]')).toBeNull();
  });

  test('uncovered endpoint can add an explicitly unverified manual flight', () => {
    const onAddPair = vi.fn();
    render(<DestinationsPanel {...baseProps} chainEnd="NRT" onAddPair={onAddPair} />);
    const details = document.querySelector<HTMLDetailsElement>('.rtw-next-manual')!;
    fireEvent.click(details.querySelector('summary')!);
    fireEvent.change(document.querySelector('[data-manual-destination-search]')!, { target: { value: 'LHR' } });
    fireEvent.click(document.querySelector('[data-manual-destination="LHR"]')!);
    const add = document.querySelector<HTMLButtonElement>('[data-add-manual="NRT-LHR"]')!;
    expect(add.disabled).toBe(true);
    fireEvent.change(document.querySelector('[data-manual-carrier]')!, { target: { value: 'BR' } });
    fireEvent.change(document.querySelector('[data-manual-timing]')!, { target: { value: 'stopover' } });
    fireEvent.change(document.querySelector('[data-manual-cabin]')!, { target: { value: 'business' } });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    expect(onAddPair).toHaveBeenCalledWith('NRT', 'LHR', 'BR', { cabin: 'business', stopover: true, manual: true });
  });

  test('manual planning can create a general surface/open-jaw segment without a carrier', () => {
    const onAddSurface = vi.fn();
    render(<DestinationsPanel {...baseProps} chainEnd="NRT" onAddSurface={onAddSurface} />);
    const details = document.querySelector<HTMLDetailsElement>('.rtw-next-manual')!;
    fireEvent.click(details.querySelector('summary')!);
    fireEvent.change(document.querySelector('[data-manual-destination-search]')!, { target: { value: 'LHR' } });
    fireEvent.click(document.querySelector('[data-manual-destination="LHR"]')!);
    fireEvent.change(document.querySelector('[data-manual-mode]')!, { target: { value: 'surface' } });
    fireEvent.click(document.querySelector('[data-add-manual="NRT-LHR"]')!);
    expect(onAddSurface).toHaveBeenCalledWith('NRT', 'LHR', undefined);
  });

  test('missing optional route network leaves schedule-backed flight numbers usable', () => {
    render(<DestinationsPanel {...baseProps} network={null} pendingIata="TPE" />);
    expect(screen.getByRole('status')).toHaveTextContent('Route-network data did not load');
    selectPair('TPE', 'SEA');
    expect(flight('BR024')).toBeEnabled();
  });
});
