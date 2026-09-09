/** Full-App UI/URL tests backed by SYNTHETIC daily schedules, not live flights. */
import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App.tsx';
import { parseShareUrl } from '../../src/lib/url-schema.ts';
import type { FlightQuery } from '../../src/lib/schemas/dated-schedules.ts';
import { CLOCK, fixtureResponse } from '../fixtures/dated-schedules.ts';

const CX = 'cx-asia-miles-oneworld-multi-carrier-award';
const SAVED = `#/r/v1/TPE-HKG?op=CX&p=CX&c=J&stp=1&d=2026-09-07&fn=473&rtw=${CX}`;
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
function leg() {
  const parsed = parseShareUrl(window.location.hash);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.request.groups[0]?.legs[0];
}
function control(selector: string) { const item = document.querySelector(selector); if (!item) throw new Error(selector); return item; }

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
  // Select the first-class airline-only draft, then resolve a real designator.
  await waitFor(() => expect(document.querySelector('[data-select-flight-later="CX:TPE-HKG"]')).not.toBeNull());
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-select-flight-later="CX:TPE-HKG"]')!);
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-open-flight-dates="TPE-HKG"]')!);
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
