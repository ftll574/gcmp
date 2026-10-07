import '@testing-library/jest-dom/vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AvinorPublicSnapshotDirectory } from '../../src/components/AvinorPublicSnapshotDirectory.tsx';
import { AvinorPublicBatchDirectory } from '../../src/components/AvinorPublicBatchDirectory.tsx';
import { AvinorFollowOnDirectory } from '../../src/components/AvinorFollowOnDirectory.tsx';
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

  const datedAction = screen.getByRole('button', { name: /^Add this Avinor-listed departure to Planner: A3757 · 2026-10-07/ });
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

test('a source-listed Avinor arrival remains a reference without a departure planner action', () => {
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

  expect(screen.getAllByText(/Source-listed arrival time; the source does not provide a departure date for this direction/).length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: 'Flight data from Avinor' })).toHaveAttribute('href', 'https://www.avinor.no/');
  expect(screen.queryByRole('button', { name: /Add flight-number reference/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Add this Avinor-listed departure to Planner/ })).not.toBeInTheDocument();
  expect(onPlanRoute).not.toHaveBeenCalled();
});

test('4Y1301 from the reconciled follow-on keeps exact source lineage and dated Planner expiry', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-10T00:00:00Z'));
  const release = JSON.parse(readFileSync('public/data/route-network/avinor-follow-on-release-20261006.json', 'utf8'));
  const ledger = readFileSync('public/data/route-network/avinor-follow-on-evidence-20261006.jsonl', 'utf8');
  const digest = (bytes: Buffer): ArrayBuffer => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  };
  vi.stubGlobal('crypto', { subtle: { digest: async (_algorithm: string, data: BufferSource) => {
    const bytes = Buffer.from(new Uint8Array(data as ArrayBuffer));
    return digest(createHash('sha256').update(bytes).digest());
  } } });
  vi.stubEnv('BASE_URL', '/gcmp/');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('avinor-follow-on-release-')) return { ok: true, json: async () => release } as Response;
    return { ok: true, text: async () => ledger } as Response;
  }));
  const onPlanRoute = vi.fn();
  const { container } = render(<AvinorFollowOnDirectory onPlanRoute={onPlanRoute} />);
  const details = container.querySelector('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  await screen.findByLabelText('Source-listed date (Europe/Oslo)');
  fireEvent.change(screen.getByLabelText('Source-listed date (Europe/Oslo)'), { target: { value: '2026-10-11' } });

  fireEvent.change(screen.getByLabelText('Search flight number, code, direction or airport'), { target: { value: '4Y1301' } });
  expect(await screen.findByRole('link', { name: 'Original XML: EVE' })).toHaveAttribute(
    'href', '/gcmp/data/route-network/avinor-xml-public-eve-20261006.xml',
  );
  const eveSnapshot = release.sourceSnapshots.find((snapshot: { airport: string }) => snapshot.airport === 'EVE');
  expect(screen.getByText(eveSnapshot.responseSHA256)).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Original XML', exact: true }).some((link) => (
    link.getAttribute('href') === `/gcmp/data/${eveSnapshot.rawAssetPath}`
  ))).toBe(true);
  expect(screen.getByRole('link', { name: 'Flight data from Avinor' })).toHaveAttribute('href', 'https://www.avinor.no/');
  expect(screen.getByRole('link', { name: 'Avinor flight-data terms' })).toHaveAttribute('href', 'https://partner.avinor.no/en/services/flight-data/');
  expect(screen.getAllByText('Display name unresolved; source code retained · 4Y').length).toBeGreaterThan(0);
  const plan = screen.getByRole('button', { name: /^Add this source-listed departure to Planner: 4Y1301 · 2026-10-11/ });
  fireEvent.click(plan);
  expect(onPlanRoute).toHaveBeenCalledWith({ from: 'EVE', to: 'FRA', carrier: '4Y', flightNumber: '1301', departsOn: '2026-10-11' });

  act(() => {
    vi.setSystemTime(new Date('2026-10-11T13:00:00Z'));
    window.dispatchEvent(new Event('focus'));
  });
  expect(screen.queryByRole('button', { name: /^Add this source-listed departure to Planner: 4Y1301 · 2026-10-11/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Scheduled time reached; this occurrence is expired/)).toBeInTheDocument();
});
