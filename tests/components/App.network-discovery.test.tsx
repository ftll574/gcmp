/** Task-level integration: build real BR/CX examples from a blank App, not a
 * prebuilt share URL. Primary-source network rows are real; dates and choices
 * are test itineraries, never claims of operating flights or award seats. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App.tsx';
import { parseShareUrl } from '../../src/lib/url-schema.ts';

const BR = 'br-infinity-star-alliance-world-travel-award';
const CX = 'cx-asia-miles-oneworld-multi-carrier-award';
const PUBLIC = join(process.cwd(), 'public');
let brokenNetwork: 'missing' | 'malformed' | null = null;

beforeEach(() => {
  brokenNetwork = null;
  window.localStorage.clear();
  window.history.replaceState({}, '', '/?view=planner');
  // Freeze only Date, not timeouts used by React/Testing Library.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    if (path.endsWith('/route-network/current.json') && brokenNetwork !== null) {
      return { ok: brokenNetwork === 'malformed', status: brokenNetwork === 'missing' ? 404 : 200, json: async () => ({ routes: [] }) };
    }
    const file = join(PUBLIC, path);
    if (!path.startsWith('/data/') || !path.endsWith('.json') || !existsSync(file)) {
      return { ok: false, status: 404, json: async () => undefined };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(file, 'utf8')) };
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Expected control not found: ${selector}`);
  return element;
}
async function mount(product = BR): Promise<void> {
  render(<App />);
  await waitFor(() => expect(document.querySelector('.rtw-gate, .route-plan-bar')).not.toBeNull(), { timeout: 5000 });
  if (document.querySelector('.route-plan-bar')) return;
  await choosePlan(product);
}
async function choosePlan(product: string): Promise<void> {
  const alliance = product === CX ? 'oneworld' : 'star';
  fireEvent.click(required<HTMLButtonElement>(`[data-alliance="${alliance}"]`));
  await waitFor(() => expect(document.querySelector(`[data-product-id="${product}"]`)).not.toBeNull());
  fireEvent.click(required<HTMLButtonElement>(`[data-product-id="${product}"]`));
  fireEvent.click(required<HTMLButtonElement>('[data-enter-planner]'));
  await waitFor(() => expect(document.querySelector('.route-plan-bar')).not.toBeNull());
}
async function switchPlan(product: string): Promise<void> {
  fireEvent.click(required<HTMLButtonElement>('.route-plan-bar button'));
  await waitFor(() => expect(document.querySelector('.rtw-gate')).not.toBeNull());
  await choosePlan(product);
}
function ensureRouteSetupExpanded(): void {
  const summary = document.querySelector<HTMLButtonElement>('.route-setup-summary');
  if (summary) fireEvent.click(summary);
}
function setCabins(cabin: 'economy' | 'premium-economy' | 'business' | 'first'): void {
  ensureRouteSetupExpanded();
  const controls = document.querySelectorAll<HTMLSelectElement>('.leg-chip-cabin');
  if (controls.length === 0) throw new Error('Missing per-leg cabin controls');
  controls.forEach((control) => fireEvent.change(control, { target: { value: cabin } }));
}
function request() {
  const parsed = parseShareUrl(window.location.hash);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.request;
}
async function add(carrier: string, from: string, to: string): Promise<void> {
  await ensureOrigin(from);
  // Choose the physical airport pair first. A known designator can be selected,
  // but an airline-only draft must remain a first-class way to continue.
  await waitFor(() => expect(document.querySelector(`[data-select-route="${from}-${to}"]`)).not.toBeNull(), { timeout: 5000 });
  fireEvent.click(required<HTMLButtonElement>(`[data-select-route="${from}-${to}"]`));
  await waitFor(() => {
    const numbered = [...document.querySelectorAll<HTMLButtonElement>('[data-select-flight-number]')]
      .find((button) => {
        const value = button.dataset.selectFlightNumber ?? '';
        const [designator, pair] = value.split(':');
        return pair === `${from}-${to}` && designator?.startsWith(carrier);
      });
    const later = document.querySelector<HTMLButtonElement>(`[data-select-flight-later="${carrier}:${from}-${to}"]`);
    expect(numbered ?? later).not.toBeNull();
  }, { timeout: 5000 });
  const numbered = [...document.querySelectorAll<HTMLButtonElement>('[data-select-flight-number]')]
    .find((button) => {
      const value = button.dataset.selectFlightNumber ?? '';
      const [designator, pair] = value.split(':');
      return pair === `${from}-${to}` && designator?.startsWith(carrier);
    });
  if (numbered) {
    const designator = numbered.dataset.selectFlightNumber?.split(':')[0];
    if (!designator) throw new Error('Missing designator');
    fireEvent.click(numbered);
    fireEvent.click(required<HTMLButtonElement>(`[data-add-selected-flight="${designator}:${from}-${to}"]`));
  } else {
    fireEvent.click(required<HTMLButtonElement>(`[data-select-flight-later="${carrier}:${from}-${to}"]`));
    fireEvent.click(required<HTMLButtonElement>(`[data-add-draft="${carrier}:${from}-${to}"]`));
  }
  expect(required('.rtw-next-origin')).toHaveAttribute('data-origin', to);
  expect(request().groups[0]?.legs.at(-1)).toMatchObject({ from, to, operatingCarrier: carrier });
}

async function ensureOrigin(from: string): Promise<void> {
  // A blank planner has no implicit origin anymore. Seed the first airport via
  // the same primary autocomplete a user sees, then every subsequent step is
  // anchored to the actual chain endpoint.
  if (!document.querySelector('.rtw-next-origin')) {
    const input = required<HTMLInputElement>('.autocomplete-input');
    fireEvent.change(input, { target: { value: from } });
    await waitFor(() => expect(document.querySelector('.autocomplete-row')).not.toBeNull());
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(document.querySelector('.rtw-next-origin')).toHaveAttribute('data-origin', from));
  }
  expect(required('.rtw-next-origin')).toHaveAttribute('data-origin', from);
}
function enterTiming(dates: string[], stopovers: boolean[]): void {
  ensureRouteSetupExpanded();
  dates.forEach((date, index) => {
    const dateButton = document.querySelectorAll<HTMLButtonElement>('.rtw-leg-date-btn')[index];
    if (!dateButton) throw new Error(`Missing leg ${index + 1} date control`);
    fireEvent.click(dateButton);
    const dialog = screen.getByRole('dialog');
    const label = new Intl.DateTimeFormat('en', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
    const day = within(dialog).getByRole('button', { name: label });
    expect(day).toBeEnabled();
    fireEvent.click(day);
    const row = document.querySelectorAll('.rtw-leg-table tbody tr')[index];
    const timing = row?.querySelectorAll<HTMLSelectElement>('select')[1];
    if (!timing) throw new Error(`Missing leg ${index + 1} stopover control`);
    fireEvent.change(timing, { target: { value: stopovers[index] ? 'stopover' : 'transfer' } });
  });
  const inputs = document.querySelectorAll<HTMLInputElement>('.rtw-trip-dates input');
  if (!inputs[0] || !inputs[1]) throw new Error('Missing trip-date controls');
  fireEvent.change(inputs[0], { target: { value: dates[0] } });
  fireEvent.change(inputs[1], { target: { value: dates.at(-1) } });
  expect(request().groups[0]?.legs.map((leg) => leg.departsOn)).toEqual(dates);
  expect(request().groups[0]?.legs.map((leg) => leg.stopover)).toEqual(stopovers);
}

test('choosing the starting airport collapses completed setup and moves attention to next nonstop', async () => {
  await mount();
  const nextStep = required<HTMLElement>('.route-next-step');
  const scrollIntoView = vi.fn();
  Object.defineProperty(nextStep, 'scrollIntoView', { configurable: true, value: scrollIntoView });

  const input = required<HTMLInputElement>('.autocomplete-input');
  fireEvent.change(input, { target: { value: 'TPE' } });
  await waitFor(() => expect(document.querySelector('.autocomplete-row')).not.toBeNull());
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(document.querySelector('[data-route-setup-collapsed="true"]')).not.toBeNull());
  expect(document.querySelector('.autocomplete-input')).toBeNull();
  expect(required('.rtw-next-origin')).toHaveAttribute('data-origin', 'TPE');
  expect(document.activeElement).toBe(nextStep);
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  expect(required('.route-setup-summary')).toHaveTextContent('TPE');
  expect(required('.route-setup-summary')).toHaveTextContent('Next: choose a nonstop from TPE');

  fireEvent.click(required<HTMLButtonElement>('.route-setup-summary'));
  expect(document.querySelector('.autocomplete-input')).not.toBeNull();
  expect(document.querySelector('[data-route-setup-collapsed="true"]')).toBeNull();
});

test('BR: blank planner → Pacific → Atlantic → Europe → Taiwan, then share/reload', async () => {
  await mount();
  expect(window.location.hash).toBe('');
  await add('BR', 'TPE', 'SFO');
  // Choosing LH for the same physical pair must not silently default to UA.
  await add('LH', 'SFO', 'FRA');
  await add('LH', 'FRA', 'MUC');
  await add('BR', 'MUC', 'TPE');
  setCabins('business');
  enterTiming(['2026-11-02', '2026-11-07', '2026-11-12', '2026-11-17'], [true, true, true, false]);
  expect(document.querySelectorAll('.rtw-finding.fail')).toHaveLength(0);
  expect(required('.rtw-status').getAttribute('data-verdict')).not.toBe('incomplete');
  expect(required('.rtw-award-price')).toHaveTextContent('325,000');
  const expected = request();
  cleanup();
  await mount();
  expect(request()).toEqual(expected);
  expect(request().groups[0]?.legs.map((leg) => leg.operatingCarrier)).toEqual(['BR', 'LH', 'LH', 'BR']);
}, 25000);

test('CX: blank planner can continue across four oneworld operators and retain timing after reload', async () => {
  await mount(CX);
  expect(window.location.hash).toBe('');
  await add('CX', 'TPE', 'HKG');
  await add('AY', 'HKG', 'HEL');
  await add('AY', 'HEL', 'LHR');
  await add('BA', 'LHR', 'JFK');
  await add('AA', 'JFK', 'LAX');
  await add('CX', 'LAX', 'HKG');
  await add('CX', 'HKG', 'TPE');
  setCabins('business');
  enterTiming(['2026-11-02', '2026-11-03', '2026-11-07', '2026-11-10', '2026-11-13', '2026-11-17', '2026-11-22'], [false, true, true, true, true, true, false]);
  expect(document.querySelectorAll('.rtw-finding.fail')).toHaveLength(0);
  expect(required('.rtw-status').getAttribute('data-verdict')).not.toBe('incomplete');
  expect(required('.rtw-panel .rtw-scope-note')).toHaveTextContent('award seats are not confirmed');
  const expected = request();
  cleanup();
  await mount(CX);
  expect(request()).toEqual(expected);
  expect(request().groups[0]?.legs.map((leg) => leg.operatingCarrier)).toEqual(['CX', 'AY', 'AY', 'BA', 'AA', 'CX', 'CX']);
}, 20000);

test.each(['missing', 'malformed'] as const)('optional route network %s cannot take down the planner', async (failure) => {
  brokenNetwork = failure;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await mount();
  await ensureOrigin('TPE');
  expect(required('.rtw-discovery-load-note')).toHaveTextContent('Route-network data did not load');
  await add('BR', 'TPE', 'SFO');
  expect(document.querySelector('[data-select-flight-later="LH:SFO-FRA"]')).toBeNull();
  expect(document.querySelector('.app-error')).toBeNull();
});

test('network observations never introduce fake weekdays into the date picker', async () => {
  await mount(CX);
  await add('CX', 'TPE', 'HKG');
  ensureRouteSetupExpanded();
  fireEvent.click(required<HTMLButtonElement>('.rtw-leg-date-btn'));
  const days = document.querySelectorAll<HTMLButtonElement>('.rtw-cal-day');
  expect(days).toHaveLength(30);
  expect([...days].every((day) => !day.disabled)).toBe(true);
  expect(required('.rtw-sched-note')).toHaveTextContent('unknown');
  const actualSchedules = JSON.parse(readFileSync(join(PUBLIC, 'data/schedules/current.json'), 'utf8')).entries;
  expect(actualSchedules).toHaveLength(138);
  expect(actualSchedules.some((row: { carrier: string }) => row.carrier === 'CX')).toBe(false);
});

test('route can still be added without choosing a flight number and keeps transfer metadata', async () => {
  await mount(CX);
  await ensureOrigin('TPE');
  await waitFor(() => expect(document.querySelector('[data-select-route="TPE-HKG"]')).not.toBeNull());
  fireEvent.click(required<HTMLButtonElement>('[data-select-route="TPE-HKG"]'));
  const later = required<HTMLButtonElement>('[data-select-flight-later="CX:TPE-HKG"]');
  expect(document.querySelector('[data-select-flight-number^="CX"]')).not.toBeNull();
  fireEvent.click(later);
  fireEvent.change(required<HTMLSelectElement>('[data-next-leg-timing="TPE-HKG"]'), { target: { value: 'transfer' } });
  fireEvent.click(required<HTMLButtonElement>('[data-add-draft="CX:TPE-HKG"]'));
  expect(request().groups[0]?.legs[0]).toMatchObject({
    from: 'TPE', to: 'HKG', operatingCarrier: 'CX', stopover: false,
  });
  expect(request().groups[0]?.legs[0]?.flightNumber).toBeUndefined();
  expect(required('.rtw-next-origin')).toHaveAttribute('data-origin', 'HKG');
  expect(window.location.hash).toContain('stp=0');
});

test('a route absent from the sourced catalog can still be planned manually without pretending it is verified', async () => {
  await mount();
  await ensureOrigin('TPE');
  expect(document.querySelector('[data-select-route="TPE-LCY"]')).toBeNull();
  const details = required<HTMLDetailsElement>('.rtw-next-manual');
  fireEvent.click(details.querySelector('summary')!);
  fireEvent.change(required<HTMLInputElement>('[data-manual-destination-search]'), { target: { value: 'LCY' } });
  await waitFor(() => expect(document.querySelector('[data-manual-destination="LCY"]')).not.toBeNull());
  fireEvent.click(required<HTMLButtonElement>('[data-manual-destination="LCY"]'));
  fireEvent.change(required<HTMLSelectElement>('[data-manual-carrier]'), { target: { value: 'BR' } });
  fireEvent.change(required<HTMLSelectElement>('[data-manual-timing]'), { target: { value: 'transfer' } });
  fireEvent.click(required<HTMLButtonElement>('[data-add-manual="TPE-LCY"]'));
  expect(request().groups[0]?.legs[0]).toMatchObject({
    from: 'TPE', to: 'LCY', operatingCarrier: 'BR', stopover: false, manual: true,
  });
  expect(request().groups[0]?.legs[0]?.flightNumber).toBeUndefined();
  expect(required('.rtw-next-origin')).toHaveAttribute('data-origin', 'LCY');
  expect(window.location.hash).toContain('man=1');

  // Guided flow collapses completed route setup; reopen it and make sure the
  // manual provenance remains visible on the leg itself.
  fireEvent.click(required<HTMLButtonElement>('.route-setup-summary'));
  expect(required('[data-leg-route="TPE-LCY"] [data-leg-manual]')).toHaveTextContent('Unverified route');

  // The review warning is persistent too, not just copy shown during entry.
  fireEvent.click(document.querySelectorAll<HTMLButtonElement>('.map-panel-button')[0]!);
  await waitFor(() => expect(document.querySelector('.rtw-findings')?.textContent).toContain('added manually'));

  const shared = window.location.hash;
  cleanup();
  window.history.replaceState({}, '', '/' + shared);
  render(<App />);
  await waitFor(() => expect(document.querySelector('[data-leg-route="TPE-LCY"] [data-leg-manual]')).not.toBeNull());
});

test('real catalog: TPE → SEA keeps TPE on the map and exposes BR024 / BR026 before cabin or date', async () => {
  await mount();
  await ensureOrigin('TPE');
  await waitFor(() => expect(document.querySelector('[data-next-leg-origin="TPE"]')).not.toBeNull());
  const pair = required<HTMLButtonElement>('[data-select-route="TPE-SEA"]');
  fireEvent.click(pair);
  expect(required('[data-selected-route="TPE-SEA"]')).toHaveTextContent('TPE→SEA');
  expect(document.querySelector('[data-select-flight-number="BR024:TPE-SEA"]')).not.toBeNull();
  expect(document.querySelector('[data-select-flight-number="BR026:TPE-SEA"]')).not.toBeNull();
  expect(document.querySelector('[data-next-leg-cabin="TPE-SEA"]')).toBeNull();
  expect(document.querySelector('[data-open-flight-dates="TPE-SEA"]')).toBeNull();
  expect(document.querySelector('[data-next-stop-preview="TPE-SEA"]')).not.toBeNull();
});

test('changing the product filters suggestions, but never rewrites existing operators', async () => {
  await mount();
  await add('BR', 'TPE', 'SFO');
  await switchPlan(CX);
  expect(request().groups[0]?.legs[0]?.operatingCarrier).toBe('BR');
  expect(document.querySelector('[data-select-flight-later="LH:SFO-FRA"]')).toBeNull();
  expect(required('[data-select-route="SFO-HKG"]')).toBeEnabled();
  fireEvent.click(required<HTMLButtonElement>('[data-select-route="SFO-HKG"]'));
  const cxNumber = [...document.querySelectorAll<HTMLButtonElement>('[data-select-flight-number]')]
    .some((button) => button.dataset.selectFlightNumber?.startsWith('CX'));
  const cxFallback = document.querySelector('[data-select-flight-later="CX:SFO-HKG"]');
  expect(cxNumber || cxFallback !== null).toBe(true);
  expect(required('[data-selected-route="SFO-HKG"]')).toHaveTextContent('SFO→HKG');
});
