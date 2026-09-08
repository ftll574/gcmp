/** Synthetic schedule responses only; no supplier calls in component tests. */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FlightDatesPanel } from '../../src/components/FlightDatesPanel.tsx';
import type { FlightQuery } from '../../src/lib/schemas/dated-schedules.ts';
import { CLOCK, fixtureResponse } from '../fixtures/dated-schedules.ts';

const props = { from: 'TPE', to: 'HKG', initialDate: '2026-09-07', carriers: new Set(['CX']), schedules: [], onChoose: vi.fn(), onClose: vi.fn() };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(CLOCK); props.onChoose.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
function request(input: RequestInfo | URL): FlightQuery {
  return Object.fromEntries(new URL(String(input)).searchParams) as unknown as FlightQuery;
}
function success() {
  const fn = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(fixtureResponse(request(input)))));
  vi.stubGlobal('fetch', fn); return fn;
}
async function queryMonth() {
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  await waitFor(() => expect(screen.queryByText('Checking published schedules…')).not.toBeInTheDocument());
}

test('unconfigured mode performs no requests and never upgrades legacy weekly rows to live evidence', () => {
  const fetchMock = success();
  render(<FlightDatesPanel {...props} apiBase="" schedules={[{
    carrier: 'CX', pair: ['TPE', 'HKG'], daysOfWeek: [1, 2, 3, 4, 5, 6, 7], status: 'operating', confidence: 'chart-verified', sourceUrls: ['https://example.com/legacy'],
  }]} />);
  expect(screen.getByRole('button', { name: 'Query this month' })).toBeDisabled();
  expect(document.querySelector('[data-flight-date="2026-09-07"]')).toHaveAttribute('data-state', 'unknown');
  expect(screen.getByText('Legacy weekly schedule references')).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('queries explicitly, renders positive and negative dates, selects the actual flight and local date', async () => {
  const fetchMock = success(); render(<FlightDatesPanel {...props} apiBase="/api" />);
  expect(fetchMock).not.toHaveBeenCalled(); await queryMonth();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-flight-date="2026-09-07"]')).toHaveAttribute('data-state', 'scheduled');
  expect(document.querySelector('[data-flight-date="2026-09-08"]')).toHaveAttribute('data-state', 'none');
  expect(screen.getByText('CX473')).toBeInTheDocument();
  expect(screen.getByText('2026-09-07 18:40 → 2026-09-07 20:40')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use this flight and date' }));
  expect(props.onChoose).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'CX', flightNumber: '473', departureLocal: '2026-09-07T18:40' }));
});

test('a flight number chosen before date scopes calendar/results to that exact flight', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const response = fixtureResponse(request(input));
    const day = response.days.find((item) => item.date === '2026-09-07');
    if (day?.flights[0]) {
      day.flights.push({
        ...day.flights[0],
        flightNumber: '475',
        departureLocal: '2026-09-07T20:00',
        arrivalLocal: '2026-09-07T22:00',
      });
    }
    return new Response(JSON.stringify(response));
  }));
  render(<FlightDatesPanel {...props} flightNumber="473" apiBase="/api" />);
  expect(document.querySelector('[data-selected-flight="CX473"]')).toHaveTextContent('CX473');
  await queryMonth();
  expect(screen.getAllByText('CX473').length).toBeGreaterThanOrEqual(2);
  expect(screen.queryByText('CX475')).not.toBeInTheDocument();
  expect(document.querySelector('[data-flight-date="2026-09-07"]')).toHaveAttribute('data-state', 'scheduled');
});

test('errors do not paint the calendar as no flights', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('error', { status: 500 })));
  render(<FlightDatesPanel {...props} apiBase="/api" />); await queryMonth();
  expect(screen.getByRole('alert')).toHaveTextContent('query failed');
  expect(document.querySelectorAll('[data-flight-date][data-state="none"]')).toHaveLength(0);
  expect(document.querySelectorAll('[data-flight-date][data-state="unknown"]')).toHaveLength(30);
});

test('a mismatched response or missing day is an error, not a partial negative calendar', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(fixtureResponse({ ...request(input), to: 'NRT' })))));
  render(<FlightDatesPanel {...props} apiBase="/api" />); await queryMonth();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(document.querySelectorAll('[data-flight-date][data-state="scheduled"]')).toHaveLength(0);
});

test('stale responses do not offer selectable flights', async () => {
  success(); vi.setSystemTime(CLOCK + 900001);
  render(<FlightDatesPanel {...props} apiBase="/api" />); await queryMonth();
  expect(document.querySelector('[data-flight-date="2026-09-07"]')).toHaveAttribute('data-state', 'unknown');
  expect(screen.queryByRole('button', { name: 'Use this flight and date' })).not.toBeInTheDocument();
});

test('an unexpired display cannot be selected after its receipt expires', async () => {
  success(); render(<FlightDatesPanel {...props} apiBase="/api" />); await queryMonth();
  const button = screen.getByRole('button', { name: 'Use this flight and date' });
  vi.setSystemTime(CLOCK + 900001); fireEvent.click(button);
  expect(props.onChoose).not.toHaveBeenCalled();
  expect(document.querySelector('[data-flight-date="2026-09-07"]')).toHaveAttribute('data-state', 'unknown');
});

test('month navigation aborts the prior request and ignores a late response', async () => {
  let resolve!: (value: Response) => void;
  let captured: FlightQuery | undefined;
  let signal: AbortSignal | undefined;
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    captured = request(input); signal = init?.signal ?? undefined;
    return new Promise<Response>((done) => { resolve = done; });
  }));
  render(<FlightDatesPanel {...props} apiBase="/api" />);
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(signal?.aborted).toBe(true);
  resolve(new Response(JSON.stringify(fixtureResponse(captured!))));
  await waitFor(() => expect(document.querySelector('[data-flight-date="2026-10-07"]')).toHaveAttribute('data-state', 'unknown'));
  expect(screen.queryByText('CX473')).not.toBeInTheDocument();
});

test('copy handoff states that seats still need airline confirmation', async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  success(); render(<FlightDatesPanel {...props} apiBase="/api" />); await queryMonth();
  fireEvent.click(screen.getByRole('button', { name: 'Copy for airline enquiry' }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  expect(writeText.mock.calls[0]?.[0]).toContain('CX473');
  expect(writeText.mock.calls[0]?.[0]).toContain('confirm award seats');
});
