import '@testing-library/jest-dom/vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FlightDatesPanel } from '../../src/components/FlightDatesPanel.tsx';
import { App } from '../../src/App.tsx';
import { parseShareUrl } from '../../src/lib/url-schema.ts';

const NOW = Date.parse('2026-09-05T14:00:00Z');
const NH = new Set(['NH']);
const BR = 'br-infinity-star-alliance-world-travel-award';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
  vi.stubEnv('VITE_SCHEDULE_API_BASE', ''); window.history.replaceState({}, '', '/');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); window.localStorage.clear(); window.history.replaceState({}, '', '/'); });

function mountPanel(from = 'NRT', to = 'BRU') {
  const onChoose = vi.fn();
  render(<FlightDatesPanel from={from} to={to} initialDate="2026-09-07" carriers={NH} schedules={[]} onChoose={onChoose} onClose={vi.fn()} />);
  return onChoose;
}
function control(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector); if (!element) throw new Error(selector); return element;
}
test('a real official timetable supplies date-only flights without a gateway, key or synthetic payload', async () => {
  const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl);
  const onChoose = mountPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  await waitFor(() => expect(control('[data-flight-date="2026-09-07"]')).toHaveAttribute('data-state', 'published'));
  fireEvent.click(control('[data-flight-date="2026-09-07"]'));
  expect(control('[data-published-flight="NH231"]')).toHaveTextContent('Time not published');
  expect(control('[data-published-flight="NH231"]')).not.toHaveTextContent('00:00');
  fireEvent.click(control('[data-choose-flight="NH231:2026-09-07"]'));
  expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'NH', flightNumber: '231', date: '2026-09-07' }));
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('unlisted weekday remains unknown, not route-wide no-flight', async () => {
  mountPanel(); fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  await waitFor(() => expect(control('[data-flight-date="2026-09-08"]')).toHaveAttribute('data-state', 'unknown'));
  expect(document.querySelectorAll('[data-flight-date][data-state="none"]')).toHaveLength(0);
  fireEvent.click(control('[data-flight-date="2026-09-08"]'));
  expect(screen.getByText(/does not mean the route has no flights/)).toBeInTheDocument();
});
test('Taiwan publications display two real flight numbers with separate selection controls', async () => {
  mountPanel('TSA', 'HND'); fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  await waitFor(() => expect(document.querySelectorAll('[data-published-flight]')).toHaveLength(2));
  expect(control('[data-published-flight="NH852"]')).toBeInTheDocument();
  expect(control('[data-published-flight="NH854"]')).toBeInTheDocument();
});
test('copying date-only results includes missing-time disclosure and original source', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  mountPanel(); fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Copy for airline enquiry' }));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Time not published'));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('https://www.ana.co.jp/'));
});
test('a gateway failure retains safe official positives and displays the failure', async () => {
  vi.stubEnv('VITE_SCHEDULE_API_BASE', '/api'); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  mountPanel(); fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('query failed');
  expect(control('[data-flight-date="2026-09-07"]')).toHaveAttribute('data-state', 'published');
});
test('expired source review cannot be renewed by pressing Query again', async () => {
  vi.setSystemTime(Date.parse('2026-10-06T00:00:00Z'));
  mountPanel(); fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  await waitFor(() => expect(document.querySelector('.flight-dates-results')).toHaveTextContent('source needs review'));
  expect(document.querySelectorAll('[data-flight-date][data-state="published"]')).toHaveLength(0);
});
test('no-key unknown routes remain honest and do not obtain invented examples', () => {
  mountPanel('TPE', 'HKG'); expect(screen.getByRole('button', { name: 'Query this month' })).toBeDisabled();
  expect(document.querySelectorAll('[data-published-flight]')).toHaveLength(0);
});
test('date-only flight selection in the actual App preserves stopovers and survives share reload', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin);
    const file = join(process.cwd(), 'public', url.pathname);
    return url.pathname.startsWith('/data/') && existsSync(file) ? new Response(readFileSync(file, 'utf8')) : new Response('', { status: 404 });
  }));
  window.history.replaceState({}, '', `/#/r/v1/TSA-HND?op=NH&p=BR&c=J&stp=1&d=2026-09-07&rtw=${BR}`);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Check flight dates.*TSA.*HND/ }).catch(() => control('[data-query-leg="0"]')));
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  await waitFor(() => expect(document.querySelector('[data-published-flight="NH852"]')).not.toBeNull());
  fireEvent.click(control('[data-flight-date="2026-09-07"]'));
  fireEvent.click(within(control('[data-published-flight="NH852"]')).getByRole('button', { name: 'Use this flight and date' }));
  const result = parseShareUrl(window.location.hash); if (!result.ok) throw new Error(result.message);
  expect(result.request.groups[0]?.legs[0]).toMatchObject({ operatingCarrier: 'NH', departsOn: '2026-09-07', flightNumber: '852', stopover: true });
  expect(window.location.hash).not.toContain('checkedAt');
  const hash = window.location.hash; cleanup(); window.history.replaceState({}, '', '/' + hash); render(<App />);
  await waitFor(() => expect(control('[data-flight-number="NH852"]')).toHaveTextContent('NH852'));
});
