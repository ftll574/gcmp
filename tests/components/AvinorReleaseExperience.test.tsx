import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AvinorPublicSnapshotDirectory } from '../../src/components/AvinorPublicSnapshotDirectory.tsx';
import { AvinorPublicBatchDirectory } from '../../src/components/AvinorPublicBatchDirectory.tsx';
import { RouteLibraryExplorer } from '../../src/components/RouteLibraryExplorer.tsx';
import { buildAirportIndex } from '../../src/lib/airport-index.ts';
import { parseRouteNetworkCatalog } from '../../src/lib/schemas/route-network.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test('links the original XML under the configured GitHub Pages /gcmp/ base', async () => {
  const snapshot = JSON.parse(readFileSync('public/data/route-network/avinor-osl-public-20261006.json', 'utf8'));
  vi.stubEnv('BASE_URL', '/gcmp/');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }));

  const { container } = render(<AvinorPublicSnapshotDirectory />);
  const details = container.querySelector('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));

  expect(await screen.findByRole('link', { name: 'Original XML snapshot' })).toHaveAttribute(
    'href',
    '/gcmp/data/route-network/avinor-osl-public-20261006.xml',
  );
});

test('a dated OSL schedule action passes its selected departure date to Planner', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
  const network = parseRouteNetworkCatalog(JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')));
  const airports = buildAirportIndex(JSON.parse(readFileSync('public/data/airports.json', 'utf8'))).byIata;
  const onPlanRoute = vi.fn();

  render(<RouteLibraryExplorer
    network={network}
    airports={airports}
    carrierNames={new Map([['A3', 'Aegean Airlines']])}
    memberCodes={new Set(['A3'])}
    selection={{ kind: 'route', id: 'OSL-ATH' }}
    onSelect={vi.fn()}
    onPlanRoute={onPlanRoute}
    alliance="star"
    onAllianceChange={vi.fn()}
    query=""
    onQueryChange={vi.fn()}
  />);

  const datedAction = screen.getByRole('button', { name: /^Plan this OSL departure: A3757 · 2026-10-07/ });
  expect(datedAction).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Use this airline in Planner' })).toBeDisabled();
  fireEvent.click(datedAction);
  expect(onPlanRoute).toHaveBeenCalledWith({ from: 'OSL', to: 'ATH', carrier: 'A3', flightNumber: '757', departsOn: '2026-10-07' });
});

test('the multi-airport directory links each original XML snapshot and displays candidate-window conflicts', async () => {
  const batch = JSON.parse(readFileSync('public/data/route-network/avinor-public-airport-batch-20261006.json', 'utf8'));
  vi.stubEnv('BASE_URL', '/gcmp/');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => batch }));

  const { container } = render(<AvinorPublicBatchDirectory />);
  const details = container.querySelector('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));

  expect(await screen.findByRole('link', { name: /Original XML · 50,058 bytes/ })).toHaveAttribute(
    'href',
    '/gcmp/data/route-network/avinor-xml-public-aes-20261006.xml',
  );
  fireEvent.change(screen.getByLabelText('Source-listed date (UTC)'), { target: { value: '2026-10-08' } });
  fireEvent.change(screen.getByLabelText('Search flight, airline, direction or airport'), { target: { value: 'LO489' } });
  expect(await screen.findByText(/The existing candidate window was unknown at capture/)).toBeInTheDocument();
});

test('multi-airport Avinor schedule rows remain read-only in route details', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
  const network = parseRouteNetworkCatalog(JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')));
  const airports = buildAirportIndex(JSON.parse(readFileSync('public/data/airports.json', 'utf8'))).byIata;
  const onPlanRoute = vi.fn();

  render(<RouteLibraryExplorer
    network={network}
    airports={airports}
    carrierNames={new Map([['LO', 'LOT Polish Airlines']])}
    memberCodes={new Set(['LO'])}
    selection={{ kind: 'route', id: 'WAW-SVG' }}
    onSelect={vi.fn()}
    onPlanRoute={onPlanRoute}
    alliance="star"
    onAllianceChange={vi.fn()}
    query=""
    onQueryChange={vi.fn()}
  />);

  expect(screen.getAllByText(/Read-only schedule evidence; Planner actions are disabled/).length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: 'Flight data from Avinor' })).toHaveAttribute('href', 'https://www.avinor.no/');
  expect(screen.queryByRole('button', { name: /Add flight-number reference/ })).not.toBeInTheDocument();
  expect(onPlanRoute).not.toHaveBeenCalled();
});
