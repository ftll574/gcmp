/** Full-App UI/URL tests backed by SYNTHETIC daily schedules, not live flights. */
import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App.tsx';
import { encodeShareUrl, parseShareUrl } from '../../src/lib/url-schema.ts';
import { DgcaScheduleEvidenceCatalogSchema, DgcaScheduleDraftReferenceSchema } from '../../src/lib/schemas/dgca-schedule-evidence.ts';
import type { FlightQuery } from '../../src/lib/schemas/dated-schedules.ts';
import { CLOCK, fixtureResponse } from '../fixtures/dated-schedules.ts';

const CX = 'cx-asia-miles-oneworld-multi-carrier-award';
const PUBLIC = join(process.cwd(), 'public');
const SAVED = `#/r/v1/TPE-HKG?op=CX&p=CX&c=J&stp=1&d=2026-09-07&fn=473&rtw=${CX}`;
const ASSUMED_SAVED = `#/r/v1/TPE-HKG?op=CX&p=CX&c=J&assume=1&rtw=${CX}`;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(CLOCK);
  vi.stubEnv('VITE_SCHEDULE_API_BASE', '/api');
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname === '/api/schedules') return new Response(JSON.stringify(fixtureResponse(Object.fromEntries(url.searchParams) as unknown as FlightQuery)));
    const file = join(process.cwd(), 'public', url.pathname);
    if (!url.pathname.startsWith('/data/') || !existsSync(file)) return new Response('', { status: 404 });
    return new Response(readFileSync(file, 'utf8'));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); window.localStorage.clear(); window.history.replaceState({}, '', '/'); });
async function mount(hash = '') {
  window.history.replaceState({}, '', hash ? '/' + hash : '/?view=planner'); render(<App />);
  await waitFor(() => expect(document.querySelector('.rtw-gate, .route-plan-bar')).not.toBeNull());
}
async function enterCxPlan() {
  fireEvent.click(control('[data-alliance="oneworld"]'));
  await waitFor(() => expect(document.querySelector(`[data-product-id="${CX}"]`)).not.toBeNull());
  fireEvent.click(control(`[data-product-id="${CX}"]`));
  fireEvent.click(control('[data-enter-planner]'));
  await waitFor(() => expect(document.querySelector('.route-plan-bar')).not.toBeNull());
}
async function enterBrPlan() {
  fireEvent.click(control('[data-alliance="star"]'));
  await waitFor(() => expect(document.querySelector('[data-product-id="br-infinity-star-alliance-world-travel-award"]')).not.toBeNull());
  fireEvent.click(control('[data-product-id="br-infinity-star-alliance-world-travel-award"]'));
  fireEvent.click(control('[data-enter-planner]'));
  await waitFor(() => expect(document.querySelector('.route-plan-bar')).not.toBeNull());
}
function leg() {
  const parsed = parseShareUrl(window.location.hash);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.request.groups[0]?.legs[0];
}
function control(selector: string) { const item = document.querySelector(selector); if (!item) throw new Error(selector); return item; }

function ix1403DraftUrl(date = '2026-10-07'): string {
  const catalog = DgcaScheduleEvidenceCatalogSchema.parse(JSON.parse(readFileSync(join(PUBLIC, 'data/dgca-schedule-evidence-20261007.json'), 'utf8')));
  const source = catalog.sources.find(item => item.id === 'dgca-air-india-express-domestic-ss-2026')!;
  const reference = source.references.find(item => item.id === 'ix-leg-033ee97a60eee28872d2')!;
  const draftReference = DgcaScheduleDraftReferenceSchema.parse({
    source: {
      id: source.id, title: source.title, url: source.url, pdfSha256: source.pdfSha256,
      publishedDateRaw: source.publishedDateRaw, checkedAt: source.checkedAt, reviewBy: source.reviewBy,
      reviewedSnapshotDate: source.reviewedSnapshotDate, attribution: source.attribution,
      reusePolicyUrl: source.reusePolicyUrl, reusePolicyStatement: source.reusePolicyStatement,
      operator: source.operator,
    },
    reference,
    catalogSnapshotAsOfDate: catalog.snapshotAsOfDate,
  });
  return '#' + encodeShareUrl({
    groups: [{ legs: [{ from: 'BLR', to: 'IXB', departsOn: date, dgcaScheduleReference: draftReference }] }],
    cabin: 'business', programs: ['aa-aadvantage'], rtwProductId: 'br-infinity-star-alliance-world-travel-award',
  });
}

test('provider-listed route can be added to the itinerary as an explicitly undated carrier assumption', async () => {
  await mount();
  await enterCxPlan();
  const start = control('.autocomplete-input') as HTMLInputElement;
  fireEvent.change(start, { target: { value: 'TPE' } });
  await waitFor(() => expect(document.querySelector('.autocomplete-row')).not.toBeNull());
  fireEvent.keyDown(start, { key: 'Enter' });
  await waitFor(() => expect(document.querySelector('[data-select-route="TPE-HKG"]')).not.toBeNull());
  fireEvent.click(control('[data-select-route="TPE-HKG"]'));

  const routeOnlySelector = '[data-select-flight-later="CX:TPE-HKG"]';
  await waitFor(() => expect(document.querySelector(routeOnlySelector)).toHaveTextContent('This draft assumes this airline'));
  fireEvent.click(control(routeOnlySelector));
  fireEvent.click(control('[data-add-draft="CX:TPE-HKG"]'));

  expect(leg()).toMatchObject({ from: 'TPE', to: 'HKG', operatingCarrier: 'CX' });
  expect(leg()?.departsOn).toBeUndefined();
  expect(leg()?.flightNumber).toBeUndefined();
  expect(window.location.hash).toContain('op=CX');
  expect(window.location.hash).not.toContain('&d=');
  expect(window.location.hash).not.toContain('&fn=');
});

test('TPE–NRT assumed BR route stays undated and unconfirmed through save/share reload and removal', async () => {
  await mount();
  await enterBrPlan();
  const start = control('.autocomplete-input') as HTMLInputElement;
  fireEvent.change(start, { target: { value: 'TPE' } });
  await waitFor(() => expect(document.querySelector('.autocomplete-row')).not.toBeNull());
  fireEvent.keyDown(start, { key: 'Enter' });
  fireEvent.change(control('.rtw-next-search input'), { target: { value: 'NRT' } });
  await waitFor(() => expect(document.querySelector('[data-select-route="TPE-NRT"]')).not.toBeNull());
  fireEvent.click(control('[data-select-route="TPE-NRT"]'));
  const assume = '[data-select-flight-later="BR:TPE-NRT"]';
  await waitFor(() => expect(document.querySelector(assume)).toHaveTextContent('This draft assumes this airline'));
  expect(document.querySelector(assume)).toHaveTextContent('actual operator and date are not confirmed');
  fireEvent.click(control(assume));
  fireEvent.click(control('[data-add-draft="BR:TPE-NRT"]'));
  expect(leg()).toMatchObject({ from: 'TPE', to: 'NRT', operatingCarrier: 'BR' });
  expect(leg()?.departsOn).toBeUndefined();
  expect(leg()?.flightNumber).toBeUndefined();
  expect(window.location.hash).toContain('op=BR');
  expect(window.location.hash).toMatch(/[?&]assume=1(?:&|$)/);
  expect(window.location.hash).not.toMatch(/[?&]d=/);
  expect(window.location.hash).not.toMatch(/[?&]fn=/);

  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  const name = screen.getByRole('textbox', { name: 'Routing name' });
  fireEvent.change(name, { target: { value: 'TPE NRT route-only draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.getItem(window.localStorage.key(index) ?? '')).join(' ')).toContain('TPE NRT route-only draft');

  const shared = window.location.hash;
  cleanup(); await mount(shared);
  expect(leg()).toMatchObject({ from: 'TPE', to: 'NRT', operatingCarrier: 'BR' });
  expect(leg()).toMatchObject({ carrierAssumed: true });
  expect(leg()?.departsOn).toBeUndefined();
  expect(leg()?.flightNumber).toBeUndefined();
  expect(document.querySelector('[data-flight-number]')).not.toBeInTheDocument();
  expect(document.querySelector('[data-leg-route="TPE-NRT"]')).toHaveTextContent('Assumed carrier');
  expect(document.querySelector('[data-rule-id="airline-eligibility"]')).toHaveClass('rtw-finding', 'unknown');
  expect(document.querySelector('[data-rule-id="airline-eligibility"]')).toHaveTextContent(/assumed carrier/i);
  expect(document.body).not.toHaveTextContent(/operating carrier confirmed/i);
  fireEvent.click(control('[data-leg-route="TPE-NRT"] .leg-chip-remove-destination'));
  expect(window.location.hash).not.toContain('TPE-NRT');
  expect(document.querySelector('[data-leg-route="TPE-NRT"]')).not.toBeInTheDocument();
}, 10_000);

test('DGCA identity draft can be dated, shared, and removed while unresolved eligibility stays unknown', async () => {
  await mount(ix1403DraftUrl());
  const date = control('[data-dgca-draft-date="0"]') as HTMLInputElement;
  expect(date.value).toBe('2026-10-07');
  expect(document.querySelector('[data-dgca-date-status="weekday-unknown"]')).toBeInTheDocument();
  expect(document.querySelector('[data-rule-id="airline-eligibility"]')).toHaveClass('rtw-finding', 'unknown');
  expect(document.querySelector('[data-rule-id="airline-eligibility"]')).toHaveTextContent(/airline and alliance eligibility are unknown/i);

  fireEvent.change(date, { target: { value: '2026-10-08' } });
  await waitFor(() => {
    const parsed = parseShareUrl(window.location.hash);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.request.groups[0]?.legs[0]?.departsOn).toBe('2026-10-08');
  });
  expect(window.location.hash).toContain('d=2026-10-08');
  fireEvent.change(date, { target: { value: '2027-01-01' } });
  await waitFor(() => expect(document.querySelector('[data-dgca-date-status="outside-window"]')).toBeInTheDocument());
  expect(window.location.hash).toContain('d=2027-01-01');

  const shared = window.location.hash;
  cleanup(); await mount(shared);
  expect(control('[data-dgca-draft-date="0"]')).toHaveValue('2027-01-01');
  expect(parseShareUrl(window.location.hash).ok).toBe(true);
  expect(document.querySelector('[data-dgca-draft-reference]')).toHaveTextContent('IX1403');
  fireEvent.click(control('[data-leg-route="BLR-IXB"] .leg-chip-remove-destination'));
  await waitFor(() => expect(document.querySelector('[data-dgca-draft-reference]')).not.toBeInTheDocument());
  expect(window.location.hash).not.toContain('ix-leg-033ee97a60eee28872d2');
}, 10_000);

test('blank planner → query dates → choose flight → save/reload retains operator/date/flight number', async () => {
  await mount();
  await enterCxPlan();
  const start = control('.autocomplete-input') as HTMLInputElement;
  fireEvent.change(start, { target: { value: 'TPE' } });
  await waitFor(() => expect(document.querySelector('.autocomplete-row')).not.toBeNull());
  fireEvent.keyDown(start, { key: 'Enter' });
  await waitFor(() => expect(document.querySelector('[data-select-route="TPE-HKG"]')).not.toBeNull());
  fireEvent.click(control('[data-select-route="TPE-HKG"]'));
  // This fixture has no cataloged CX flight number before the live query.
  // The explicitly undated route draft is available, and querying can still
  // resolve the real designator before the dated leg is added.
  await waitFor(() => expect(document.querySelector('[data-verify-live-carrier="CX:TPE-HKG"]')).not.toBeNull());
  expect(document.querySelector('[data-select-flight-later="CX:TPE-HKG"]')).toHaveTextContent('This draft assumes this airline');
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-verify-live-carrier="CX:TPE-HKG"]')!);
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Use this flight and date' }));
  expect(leg()).toMatchObject({ from: 'TPE', to: 'HKG', operatingCarrier: 'CX', departsOn: '2026-09-07', flightNumber: '473' });
  expect(window.location.hash).not.toContain('checkedAt');
  const saved = window.location.hash; cleanup(); await mount(saved);
  expect(leg()?.flightNumber).toBe('473');
  expect(control('[data-flight-number="CX473"]')).toHaveTextContent('CX473');
}, 10_000);

test('changing the operating carrier clears the stale flight number but preserves date/stopover', async () => {
  await mount(SAVED); fireEvent.change(control('.leg-chip-carrier'), { target: { value: 'AA' } });
  expect(leg()).toMatchObject({ operatingCarrier: 'AA', departsOn: '2026-09-07', stopover: true });
  expect(leg()?.flightNumber).toBeUndefined();
});

test('manual date changes preserve the preselected flight number for revalidation on the new date', async () => {
  await mount(SAVED); fireEvent.click(control('.rtw-leg-date-btn'));
  fireEvent.click(screen.getByRole('button', { name: 'Tuesday, September 8, 2026' }));
  expect(leg()?.departsOn).toBe('2026-09-08'); expect(leg()?.flightNumber).toBe('473');
  expect(leg()?.stopover).toBe(true);
});

test('stopover edits keep the selected flight but converting to surface clears all flight metadata', async () => {
  await mount(SAVED); fireEvent.change(control('.leg-chip-stopover'), { target: { value: '' } });
  expect(leg()?.flightNumber).toBe('473');
  fireEvent.click(control('.leg-chip-surface input'));
  expect(leg()?.flightNumber).toBeUndefined();
  expect(leg()?.departsOn).toBeUndefined();
  expect(leg()?.operatingCarrier).toBeUndefined();
});

test('an existing segment can be re-queried without appending a duplicate leg', async () => {
  await mount(SAVED); fireEvent.click(control('[data-query-leg="0"]'));
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Use this flight and date' }));
  expect(leg()?.flightNumber).toBe('473'); expect(leg()?.stopover).toBe(true);
  const parsed = parseShareUrl(window.location.hash);
  expect(parsed.ok && parsed.request.groups[0]?.legs).toHaveLength(1);
});

test('choosing a dated schedule confirms the operator and clears the persisted carrier assumption', async () => {
  await mount(ASSUMED_SAVED);
  expect(leg()).toMatchObject({ carrierAssumed: true });
  fireEvent.click(control('[data-query-leg="0"]'));
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Use this flight and date' }));
  expect(leg()).toMatchObject({ operatingCarrier: 'CX', departsOn: '2026-09-07', flightNumber: '473' });
  expect(leg()).not.toHaveProperty('carrierAssumed');
  expect(window.location.hash).not.toContain('assume=');
});
