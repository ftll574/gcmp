/** Permanent regressions promoted from the 2026-09-05 takeover probes.
 * Exercise the actual App, hooks, effects and URL with the real catalogs. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App.tsx';
import { parseShareUrl } from '../../src/lib/url-schema.ts';
import * as validator from '../../src/lib/rtw/validate.ts';

const BR = 'br-infinity-star-alliance-world-travel-award';
const CX = 'cx-asia-miles-oneworld-multi-carrier-award';
const PUBLIC = join(process.cwd(), 'public');
let injectExplorerFixture = false;
let omitLegacyPrograms = false;

beforeEach(() => {
  injectExplorerFixture = false;
  omitLegacyPrograms = false;
  window.history.replaceState({}, '', '/?view=planner');
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    const file = join(PUBLIC, path);
    if (omitLegacyPrograms && path.includes('/programs/')) {
      return { ok: false, status: 404, json: async () => undefined };
    }
    if (!path.startsWith('/data/') || !path.endsWith('.json') || !existsSync(file)) {
      return { ok: false, status: 404, json: async () => undefined };
    }
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (injectExplorerFixture && path.endsWith('/schedules/current.json')) {
      // Controlled interaction fixture, NOT a real-world schedule claim.
      data.entries.push({ ...data.entries[0], carrier: 'UA', pair: ['NRT', 'LAX'] });
    }
    return { ok: true, status: 200, json: async () => data };
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

async function mount(hash: string): Promise<void> {
  window.history.replaceState({}, '', '/' + hash);
  render(<App />);
  await waitFor(() => expect(document.querySelector('.route-plan-bar')).not.toBeNull());
}

async function switchPlan(product: string): Promise<void> {
  const alliance = product === CX ? 'oneworld' : 'star';
  const change = document.querySelector<HTMLButtonElement>('.route-plan-bar button');
  if (!change) throw new Error('Change-plan control missing');
  fireEvent.click(change);
  await waitFor(() => expect(document.querySelector('.rtw-gate')).not.toBeNull());
  const allianceButton = document.querySelector<HTMLButtonElement>(`[data-alliance="${alliance}"]`);
  if (!allianceButton) throw new Error('Alliance control missing');
  fireEvent.click(allianceButton);
  await waitFor(() => expect(document.querySelector(`[data-product-id="${product}"]`)).not.toBeNull());
  fireEvent.click(document.querySelector<HTMLButtonElement>(`[data-product-id="${product}"]`)!);
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-enter-planner]')!);
  await waitFor(() => expect(document.querySelector('.route-plan-bar')).not.toBeNull());
}

function request() {
  const parsed = parseShareUrl(window.location.hash);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.request;
}

function select(selector: string): HTMLSelectElement {
  const element = document.querySelector<HTMLSelectElement>(selector);
  if (!element) throw new Error('Control missing: ' + selector);
  return element;
}

const DATED = `#/r/v1/TPE-NRT-LAX?op=BR,UA&p=BR&c=J&stp=1,0&fc=J,J&d=2026-11-02,2026-11-06&rtw=${BR}`;

test('fresh sessions choose alliance and ticketing plan before the workbench, with no global cabin prerequisite', async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector('.rtw-gate')).not.toBeNull());
  expect(document.querySelector('.route-plan-bar')).toBeNull();
  expect(document.querySelector('.app-workbench')).toBeNull();
  expect(document.querySelector('.cabin-selector')).toBeNull();
  expect(document.querySelector('.leg-chip-cabin')).toBeNull();

  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="star"]')!);
  await waitFor(() => expect(document.querySelector(`[data-product-id="${BR}"]`)).not.toBeNull());
  expect(document.querySelector('.route-plan-bar')).toBeNull();
  fireEvent.click(document.querySelector<HTMLButtonElement>(`[data-product-id="${BR}"]`)!);
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-enter-planner]')!);
  await waitFor(() => expect(document.querySelector('.route-plan-bar')).not.toBeNull());
  expect(document.querySelector('.rtw-gate')).toBeNull();
  expect(document.querySelector('.app-workbench')).not.toBeNull();
  expect(document.querySelector('.cabin-selector')).toBeNull();
});

test('clearing the stopover marker preserves the departure date', async () => {
  await mount(DATED);
  expect(request().groups[0]?.legs[0]?.departsOn).toBe('2026-11-02');
  fireEvent.change(select('.leg-chip-stopover'), { target: { value: '' } });
  expect(request().groups[0]?.legs[0]?.departsOn).toBe('2026-11-02');
});

test('clearing the legacy fare class preserves the departure date', async () => {
  await mount(DATED);
  fireEvent.change(select('.leg-chip-fareclass'), { target: { value: '' } });
  expect(request().groups[0]?.legs[0]?.departsOn).toBe('2026-11-02');
});

test('surface normalization drops flight metadata and switching back creates a fresh flight', async () => {
  await mount(DATED + '&surf=1,0');
  const initial = request().groups[0]?.legs[0];
  expect(initial).toEqual({ from: 'TPE', to: 'NRT', surface: true, stopover: true });
  const checkbox = document.querySelector<HTMLInputElement>('.leg-chip-surface input');
  if (!checkbox) throw new Error('Surface checkbox missing');
  expect(checkbox.checked).toBe(true);
  fireEvent.click(checkbox);
  expect(request().groups[0]?.legs[0]).toMatchObject({ from: 'TPE', to: 'NRT', operatingCarrier: 'UA', stopover: true });
  expect(request().groups[0]?.legs[0]).not.toHaveProperty('departsOn');
  expect(request().groups[0]?.legs[0]).not.toHaveProperty('cabin');
});

test('removing the first airport preserves an unchanged downstream leg', async () => {
  await mount(DATED);
  const remainingLeg = request().groups[0]?.legs[1];
  const remove = document.querySelector<HTMLButtonElement>('.leg-chip-remove');
  if (!remove) throw new Error('Remove control missing');
  fireEvent.click(remove);
  expect(request().groups[0]?.legs[0]).toEqual(remainingLeg);
});

test('importing an incompatible carrier preserves input AND exposes it for validation', async () => {
  await mount(`#/r/v1/TPE-HKG?op=CX&p=BR&c=J&d=2026-11-02&rtw=${BR}`);
  expect(request().groups[0]?.legs[0]?.operatingCarrier).toBe('CX');
  expect(select('.leg-chip-carrier').value).toBe('CX');
  expect(select('.leg-chip-carrier').getAttribute('aria-invalid')).toBe('true');
  expect(document.querySelector('.rtw-findings')?.textContent).toContain('CX');
});

test('switching the redemption product does not silently replace flight operators', async () => {
  await mount(DATED);
  const original = request().groups;
  await switchPlan(CX);
  expect(request().groups[0]?.legs.map(leg => leg.operatingCarrier)).toEqual(['BR', 'UA']);
  expect(request().groups).toEqual(original);
  await switchPlan(BR);
  expect(request().groups).toEqual(original);
});

test('the explorer passes its selected operator through to the added leg', async () => {
  injectExplorerFixture = true;
  await mount(`#/r/v1/TPE-NRT?op=BR&p=BR&c=J&rtw=${BR}`);
  const pair = document.querySelector<HTMLButtonElement>('[data-select-route="NRT-LAX"]');
  if (!pair) throw new Error('Controlled explorer airport pair missing');
  fireEvent.click(pair);
  const operator = document.querySelector<HTMLButtonElement>('[data-select-flight-later="UA:NRT-LAX"]');
  if (!operator) throw new Error('Controlled explorer operator missing');
  expect(operator.disabled).toBe(false);
  fireEvent.click(operator);
  const add = document.querySelector<HTMLButtonElement>('[data-add-draft="UA:NRT-LAX"]');
  if (!add) throw new Error('Controlled explorer add-draft control missing');
  fireEvent.click(add);
  expect(request().groups[0]?.legs[1]?.operatingCarrier).toBe('UA');
});

test('the App passes loaded schedules into validation and renders the mismatch', async () => {
  const spy = vi.spyOn(validator, 'validateRtwRoute');
  await mount(`#/r/v1/TPE-MUC?op=BR&p=BR&c=J&d=2026-09-05&rtw=${BR}`);
  const invocation = spy.mock.calls.at(-1);
  if (!invocation) throw new Error('App did not run validation');
  const schedules = JSON.parse(readFileSync(join(PUBLIC, 'data/schedules/current.json'), 'utf8')).entries;
  const control = validator.validateRtwRoute(invocation[0], invocation[1], {
    ...invocation[2], schedules,
  }, invocation[3]);
  expect(control.findings.some(finding => finding.ruleId === 'schedule-day-mismatch')).toBe(true);
  expect(invocation[2].schedules).toEqual(schedules);
  expect(document.querySelector('.rtw-findings')?.textContent).toContain('2026-09-05');
});

test('a repaired date survives a share URL reload', async () => {
  await mount(DATED);
  fireEvent.change(select('.leg-chip-stopover'), { target: { value: '' } });
  const expected = request();
  const hash = window.location.hash;
  cleanup();
  await mount(hash);
  expect(request()).toEqual(expected);
});

test('clearing a route does not swallow the next external share navigation', async () => {
  await mount(DATED);
  const clear = document.querySelector<HTMLButtonElement>('.app-clear');
  if (!clear) throw new Error('Clear control missing');
  fireEvent.click(clear);
  expect(window.location.hash).toBe('');
  window.location.hash = `#/r/v1/TPE-HKG?op=CX&p=CX&c=J&rtw=${CX}`;
  await waitFor(() => expect(select('.leg-chip-carrier').value).toBe('CX'));
});

test('legacy earning-data failure cannot take down the RTW planner', async () => {
  omitLegacyPrograms = true;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await mount(DATED);
  expect(document.querySelector('.rtw-award-price')?.textContent).toContain('325,000');
  expect(request().groups[0]?.legs).toHaveLength(2);
});

test('primary route flow keeps next-leg selection visible while flight details and review stay collapsed', async () => {
  await mount(DATED);
  expect(document.querySelector('.route-plan-bar')?.textContent).toContain('EVA Infinity MileageLands');
  expect(document.querySelector('.rtw-planning-context')).toBeNull();
  expect(document.querySelector('.cabin-selector')).toBeNull();
  const table = document.querySelector('.rtw-leg-table-wrap');
  const explorer = document.querySelector('.rtw-explorer');
  expect(table?.closest('details')?.open).toBe(false);
  expect(explorer?.closest('.route-next-step')).not.toBeNull();
  expect(explorer?.closest('details')).toBeNull();
  expect(document.querySelector('.route-explorer-details')).toBeNull();
  expect(document.querySelector('.rtw-next-origin')).not.toBeNull();
  expect(document.querySelector('.app-panel')?.classList.contains('open')).toBe(false);
  const legRows = [...document.querySelectorAll<HTMLElement>('.leg-chip[data-leg-route]')];
  expect(legRows).toHaveLength(2);
  expect(legRows[0]?.getAttribute('data-leg-route')).toBe('TPE-NRT');
  expect(legRows[0]?.querySelector('.leg-chip-route-airports')?.textContent).toContain('TPE→NRT');
  expect(legRows[1]?.getAttribute('data-leg-route')).toBe('NRT-LAX');
  expect(legRows[1]?.querySelector('.leg-chip-route-airports')?.textContent).toContain('NRT→LAX');
  expect(document.querySelector('.leg-chip-summary')).not.toBeNull();
  expect(document.querySelector('.leg-chip-carrier-wrap')?.classList.contains('is-open')).toBe(false);
  expect(table && explorer && (table.compareDocumentPosition(explorer) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();

  fireEvent.click(document.querySelector<HTMLButtonElement>('.leg-chip-summary')!);
  expect(document.querySelector('.leg-chip-carrier-wrap')?.classList.contains('is-open')).toBe(true);

  fireEvent.click(document.querySelector<HTMLButtonElement>('.map-panel-button')!);
  expect(document.querySelector('.app-panel')?.classList.contains('open')).toBe(true);
  fireEvent.click(document.querySelector<HTMLButtonElement>('.inspector-close')!);
  expect(document.querySelector('.app-panel')?.classList.contains('open')).toBe(false);
});

test('same-city airport change is a real surface leg and never exposes a fake flight carrier/cabin', async () => {
  await mount(`#/r/v1/TPE-NRT?op=BR&p=BR&c=J&rtw=${BR}`);
  const change = document.querySelector<HTMLButtonElement>('[data-select-surface="NRT-HND"]');
  expect(change).not.toBeNull();
  fireEvent.click(change!);
  fireEvent.change(document.querySelector<HTMLSelectElement>('[data-surface-timing="NRT-HND"]')!, { target: { value: 'transfer' } });
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-add-surface="NRT-HND"]')!);

  expect(request().groups[0]?.legs[1]).toMatchObject({
    from: 'NRT', to: 'HND', surface: true, stopover: false,
  });
  expect(window.location.hash).toContain('surf=%2C1');
  fireEvent.click(document.querySelector<HTMLButtonElement>('.route-setup-summary')!);
  const surfaceRow = document.querySelector<HTMLElement>('[data-leg-route="NRT-HND"]');
  expect(surfaceRow).not.toBeNull();
  expect(surfaceRow?.textContent).toContain('NRT⇢HND');
  expect(surfaceRow?.textContent).toContain('Surface');
  expect(surfaceRow?.querySelector('.leg-chip-flight-number')).toBeNull();
  fireEvent.click(surfaceRow!.querySelector<HTMLButtonElement>('.leg-chip-summary')!);
  expect(surfaceRow?.querySelector('.leg-chip-carrier')).toBeNull();
  expect(surfaceRow?.querySelector('.leg-chip-cabin')).toBeNull();
  expect(document.querySelector('.rtw-next-origin')?.getAttribute('data-origin')).toBe('HND');
});

test('legacy global cabin becomes per-leg cabin, then mixed cabins survive sharing', async () => {
  await mount(DATED);
  const cabinControls = document.querySelectorAll<HTMLSelectElement>('.leg-chip-cabin');
  expect(cabinControls).toHaveLength(2);
  expect([...cabinControls].map((control) => control.value)).toEqual(['business', 'business']);
  fireEvent.change(cabinControls[0]!, { target: { value: 'economy' } });
  fireEvent.change(cabinControls[1]!, { target: { value: 'first' } });
  expect(request().groups[0]?.legs.map((leg) => leg.cabin)).toEqual(['economy', 'first']);
  expect(window.location.hash).toContain('cab=Y%2CF');
  const saved = window.location.hash;
  cleanup();
  await mount(saved);
  expect(request().groups[0]?.legs.map((leg) => leg.cabin)).toEqual(['economy', 'first']);
});

test('unknown stopovers and missing dates do not receive a green verdict', async () => {
  await mount(`#/r/v1/TPE-HKG-HEL-LHR-JFK-HND-TPE?op=CX,AY,AY,BA,JL,JL&p=CX&c=J&rtw=${CX}`);
  expect(document.querySelector('.rtw-status')?.getAttribute('data-verdict')).toBe('incomplete');
  expect(document.querySelector('.rtw-planning-note')?.textContent).toContain('6');
  expect(document.querySelector('.rtw-panel .rtw-scope-note')?.textContent).toContain('award seats are not confirmed');
});

test('whole-itinerary award price stays hidden until every flown leg has a cabin', async () => {
  await mount(`#/r/v1/TPE-HKG-HEL?op=CX,AY&p=CX&c=J&cab=J,&stp=1,0&d=2026-11-02,2026-11-07&rtw=${CX}`);
  expect(document.querySelector('.rtw-panel')?.textContent).toContain('Choose a cabin for 1 flown leg');
  expect(document.querySelector('.rtw-award-price-topline')).toBeNull();
  const cabins = document.querySelectorAll<HTMLSelectElement>('.leg-chip-cabin');
  expect(cabins).toHaveLength(2);
  fireEvent.change(cabins[1]!, { target: { value: 'first' } });
  expect(document.querySelector('.rtw-panel')?.textContent).not.toContain('Choose a cabin for 1 flown leg');
  expect(document.querySelector('.rtw-award-price-topline')).not.toBeNull();
});

test('Qantas new-booking UI uses points and explicitly labels the applicable booking era', async () => {
  await mount('#/r/v1/TPE-NRT-LAX-JFK-LHR-HKG-TPE?op=JL,JL,AA,BA,CX,CX&p=AA&c=J&rtw=qantas-oneworld-classic-flight-reward');
  expect(document.querySelector('.rtw-award-price')?.textContent).toContain('Qantas Points');
  expect(document.querySelector('.rtw-pricing-era')?.textContent).toContain('2025-08-05');
});
