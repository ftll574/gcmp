import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FlightDatesPanel } from '../../src/components/FlightDatesPanel.tsx';
import { normalizeTdxSchedules } from '../../server/tdx-schedules.ts';
import { capturedRows, capturedServices } from '../fixtures/tdx-captured-2026-09-06.ts';
import { OPERATOR_EVIDENCE_CHECKED_AT } from '../../server/operator-evidence.ts';

// Recorded public inputs through the actual normalizer + React calendar.
// The HTTP boundary is mocked and the clock is HISTORICAL, not live browser QA.
const EVIDENCE_NOW = Date.parse(OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(EVIDENCE_NOW); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); window.localStorage.clear(); });
function control(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector); if (!element) throw new Error(selector); return element;
}
function mount(to: string, initialDate: string, carriers = new Set(['BR', 'CX'])) {
  const entries = capturedServices.filter((entry) => entry.from === 'TPE' && entry.to === to);
  const month = initialDate.slice(0, 7);
  const result = normalizeTdxSchedules(entries.flatMap(capturedRows), {
    from: 'TPE', to, start: `${month}-01`, end: `${month}-${month === '2026-09' ? '30' : '31'}`,
  }, Date.parse(entries[0]!.fetchedAt), EVIDENCE_NOW);
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(result))); vi.stubGlobal('fetch', fetchImpl);
  const onChoose = vi.fn();
  render(<FlightDatesPanel from="TPE" to={to} initialDate={initialDate} carriers={carriers}
    schedules={[]} onChoose={onChoose} onClose={vi.fn()} apiBase="/api" />);
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  return { onChoose, fetchImpl, result };
}

test('captured Hong Kong JX233 becomes selectable only inside the official STARLUX evidence window', async () => {
  const { onChoose, fetchImpl } = mount('HKG', '2026-09-10', new Set(['JX']));
  await waitFor(() => expect(document.querySelectorAll('[data-published-flight="JX233"]')).toHaveLength(1));
  expect(control('[data-published-flight="JX233"]')).toHaveTextContent('08:10');
  expect(control('[data-published-flight="JX233"]')).toHaveTextContent('STARLUX official timetable API');
  expect(control('[data-flight-date="2026-09-10"]')).toHaveTextContent('1 flight');
  expect(control('[data-flight-date="2026-09-05"]')).toHaveAttribute('data-state', 'unknown');
  fireEvent.click(control('[data-choose-flight="JX233:2026-09-10"]'));
  expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'JX', flightNumber: '233', date: '2026-09-10' }));
  expect(document.querySelectorAll('[data-flight-date][data-state="none"]')).toHaveLength(0);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('captured Pacific dates preserve cross-day copy and keep October 25 unknown, not cancelled', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const { onChoose } = mount('SFO', '2026-10-24');
  await waitFor(() => expect(document.querySelectorAll('[data-timetable-reference]')).toHaveLength(2));
  expect(control('[data-published-flight="BR8"]')).toHaveTextContent('Arrival date unconfirmed');
  expect(control('[data-published-flight="BR8"]')).toHaveTextContent('06:35');
  expect(control('[data-published-flight="BR8"]')).toHaveTextContent('EVA Air official flight status');
  expect(control('[data-choose-flight="BR8:2026-10-24"]')).toBeInTheDocument();
  fireEvent.click(within(control('[data-timetable-reference="AS7218"]')).getByRole('button', { name: 'Copy to verify operator' }));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('2026-10-24 00:05 → 2026-10-23 20:30'));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('may be a marketing codeshare'));
  fireEvent.click(control('[data-flight-date="2026-10-25"]'));
  expect(control('[data-flight-date="2026-10-25"]')).toHaveAttribute('data-state', 'unknown');
  expect(document.querySelectorAll('[data-timetable-reference], [data-choose-flight], [data-flight-date][data-state="none"]')).toHaveLength(0);
  expect(onChoose).not.toHaveBeenCalled();
});

test.each(['2026-10-24', '2026-10-25'])('a date clicked during a pending query stays selected: %s', async (date) => {
  const { fetchImpl, result } = mount('SFO', '2026-10-01');
  await waitFor(() => expect(document.querySelectorAll('[data-timetable-reference]')).toHaveLength(2));
  let release!: (response: Response) => void;
  fetchImpl.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  fireEvent.click(control(`[data-flight-date="${date}"]`));
  await act(async () => { release(new Response(JSON.stringify(result))); });
  await waitFor(() => expect(control('.flight-dates-grid')).toHaveAttribute('aria-busy', 'false'));
  expect(control(`[data-flight-date="${date}"]`)).toHaveAttribute('aria-pressed', 'true');
  expect(control('.flight-dates-results h4')).toHaveTextContent(date);
  expect(document.querySelectorAll('[data-timetable-reference]')).toHaveLength(date.endsWith('24') ? 2 : 0);
  // A subsequent refresh must not silently skip a deliberately inspected gap.
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  await waitFor(() => expect(control('.flight-dates-grid')).toHaveAttribute('aria-busy', 'false'));
  expect(control(`[data-flight-date="${date}"]`)).toHaveAttribute('aria-pressed', 'true');
});
