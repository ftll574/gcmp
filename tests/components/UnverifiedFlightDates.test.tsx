import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App.tsx';
import { FlightDatesPanel } from '../../src/components/FlightDatesPanel.tsx';
import { normalizeTdxSchedules } from '../../server/tdx-schedules.ts';
import { LATEST_OPERATOR_EVIDENCE_CHECKED_AT } from '../../server/operator-evidence.ts';
import { parseShareUrl } from '../../src/lib/url-schema.ts';

// Synthetic missing-CodeShare case, NOT reconstructed live timetable facts.
const NOW = Date.parse('2026-09-05T16:09:44Z');
const query = { from: 'TPE', to: 'SFO', start: '2026-09-01', end: '2026-09-30' };
const row = {
  AirlineID: 'BR', FlightNumber: 'BR998', DepartureAirportID: 'TPE', ArrivalAirportID: 'SFO',
  ScheduleStartDate: '2026-09-07', ScheduleEndDate: '2026-09-07',
  DepartureTime: null, ArrivalTime: null,
  Monday: true, Tuesday: false, Wednesday: false, Thursday: false,
  Friday: false, Saturday: false, Sunday: false, UpdateTime: new Date(NOW).toISOString(),
};
const response = () => normalizeTdxSchedules([row, { ...row, AirlineID: 'AS', FlightNumber: 'AS7218' }], query, NOW, NOW);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
  vi.stubEnv('VITE_SCHEDULE_API_BASE', '/api');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response()))));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
  window.localStorage.clear(); window.history.replaceState({}, '', '/');
});
function control(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector); if (!element) throw new Error(selector); return element;
}
function mount(carriers = new Set(['BR'])) {
  const props = { from: 'TPE', to: 'SFO', initialDate: '2026-09-07', carriers,
    schedules: [], onChoose: vi.fn(), onClose: vi.fn() };
  return { ...render(<FlightDatesPanel {...props} />), props };
}
async function load() {
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  await waitFor(() => expect(document.querySelectorAll('[data-timetable-reference]')).toHaveLength(2));
}

test('unverified record dates remain visible but cannot be selected as operating flights', async () => {
  const { props } = mount(); await load();
  expect(control('[data-flight-date="2026-09-07"]')).toHaveTextContent('2 records to check');
  expect(control('[data-flight-date="2026-09-07"]')).toHaveAttribute('data-state', 'unknown');
  expect(control('[data-flight-date="2026-09-07"]')).toHaveAccessibleName(/operator unverified/);
  expect(control('[data-timetable-reference="BR998"]')).toHaveTextContent('Time not published');
  expect(control('[data-timetable-reference="BR998"]')).not.toHaveTextContent('00:00');
  expect(document.querySelectorAll('[data-choose-flight], [data-published-flight]')).toHaveLength(0);
  expect(document.querySelectorAll('[data-flight-date][data-state="none"]')).toHaveLength(0);
  expect(props.onChoose).not.toHaveBeenCalled();
});

test('BR/CX operator filters do not promote or hide unresolved marketing designators', async () => {
  const { rerender, props } = mount(new Set(['BR', 'UA', 'TG'])); await load();
  expect(document.querySelectorAll('[data-timetable-reference]')).toHaveLength(2);
  rerender(<FlightDatesPanel {...props} carriers={new Set(['CX', 'AS'])} />);
  expect(document.querySelectorAll('[data-timetable-reference]')).toHaveLength(2);
  expect(document.querySelectorAll('[data-choose-flight]')).toHaveLength(0);
  expect(screen.getByText(/Some are unresolved marketing designators/)).toBeInTheDocument();
});

test('customer-service copy explicitly requests operating identity and never implies validated eligibility', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  mount(); await load();
  fireEvent.click(within(control('[data-timetable-reference="AS7218"]')).getByRole('button', { name: 'Copy to verify operator' }));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('AS7218 | TPE → SFO'));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('may be a marketing codeshare'));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Confirm the operating airline'));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('https://data.gov.tw/dataset/161167'));
});

test('known Cathay marketing codeshare names the different operator but remains non-selectable', async () => {
  const evidenceNow = Date.parse(LATEST_OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
  vi.setSystemTime(evidenceNow);
  const cxRow = {
    AirlineID: 'CX', FlightNumber: 'CX5111', DepartureAirportID: 'TPE', ArrivalAirportID: 'HKG',
    ScheduleStartDate: '2026-09-10', ScheduleEndDate: '2026-09-10', DepartureTime: '07:55', ArrivalTime: '09:50',
    Monday: false, Tuesday: false, Wednesday: false, Thursday: true, Friday: false, Saturday: false, Sunday: false,
    CodeShare: [], UpdateTime: new Date(evidenceNow).toISOString(),
  };
  const cxQuery = { from: 'TPE', to: 'HKG', start: '2026-09-01', end: '2026-09-30' };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(normalizeTdxSchedules([cxRow], cxQuery, evidenceNow, evidenceNow)))));
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const props = { from: 'TPE', to: 'HKG', initialDate: '2026-09-10', carriers: new Set(['CX']),
    schedules: [], onChoose: vi.fn(), onClose: vi.fn() };
  render(<FlightDatesPanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  await waitFor(() => expect(document.querySelector('[data-timetable-reference="CX5111"]')).not.toBeNull());
  const reference = control('[data-timetable-reference="CX5111"]');
  expect(reference).toHaveTextContent('different operator identified');
  expect(reference).toHaveTextContent('operated by UO');
  expect(reference).toHaveTextContent('HK Express UO111 codeshare schedule');
  expect(document.querySelectorAll('[data-choose-flight]')).toHaveLength(0);
  fireEvent.click(within(reference).getByRole('button', { name: 'Copy to verify operator' }));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('operated by UO'));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('https://www.flight.info/UO111'));
  expect(props.onChoose).not.toHaveBeenCalled();
});

test('a reference that expires before a click cannot be copied as fresh evidence', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  mount(); await load();
  vi.setSystemTime(NOW + 4 * 3600000);
  fireEvent.click(within(control('[data-timetable-reference="BR998"]')).getByRole('button', { name: 'Copy to verify operator' }));
  expect(writeText).not.toHaveBeenCalled();
  expect(document.querySelectorAll('[data-timetable-reference]')).toHaveLength(0);
  expect(document.querySelectorAll('[data-flight-date][data-state="none"]')).toHaveLength(0);
});

test('querying and copying unresolved records in the actual App cannot populate fn/op in a shared itinerary', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname.includes('/api/schedules')) return new Response(JSON.stringify(response()));
    const file = join(process.cwd(), 'public', url.pathname);
    return url.pathname.startsWith('/data/') && existsSync(file) ? new Response(readFileSync(file, 'utf8')) : new Response('', { status: 404 });
  }));
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  window.history.replaceState({}, '', '/#/r/v1/TPE-SFO?op=BR&p=BR&c=J&stp=1&d=2026-09-07&rtw=br-infinity-star-alliance-world-travel-award');
  render(<App />);
  await waitFor(() => expect(document.querySelector('[data-query-leg="0"]')).not.toBeNull());
  const before = window.location.hash;
  fireEvent.click(control('[data-query-leg="0"]')); await load();
  fireEvent.click(within(control('[data-timetable-reference="AS7218"]')).getByRole('button', { name: 'Copy to verify operator' }));
  expect(window.location.hash).toBe(before);
  const result = parseShareUrl(window.location.hash); if (!result.ok) throw new Error(result.message);
  expect(result.request.groups[0]?.legs[0]).toMatchObject({ operatingCarrier: 'BR', departsOn: '2026-09-07', stopover: true });
  expect(result.request.groups[0]?.legs[0]?.flightNumber).toBeUndefined();
  expect(document.querySelectorAll('[data-choose-flight]')).toHaveLength(0);
});
