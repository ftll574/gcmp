import { cleanup, fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { RtwLegTable } from '../../src/components/RtwLegTable.tsx';

afterEach(cleanup);
const props = {
  airports: [
    { iata: 'TPE', name: 'Taoyuan', city: 'Taipei', country: 'TW', lat: 25, lon: 121 },
    { iata: 'NRT', name: 'Narita', city: 'Tokyo', country: 'JP', lat: 35, lon: 140 },
  ],
  legs: [{ from: 'TPE', to: 'NRT', operatingCarrier: 'BR', stopover: true, departsOn: '2099-11-02' }],
  airlines: [{ iata: 'BR', name: 'EVA Air', country: 'TW' }],
  onCarrierChange: vi.fn(), onStopoverChange: vi.fn(), onSurfaceChange: vi.fn(), onDateChange: vi.fn(),
};

test('frequency note follows the selected departure date rather than today', () => {
  render(<RtwLegTable {...props} schedules={[{
    carrier: 'BR', pair: ['TPE', 'NRT'], daysOfWeek: [1, 3], status: 'operating',
    effectiveFrom: '2099-11-01', effectiveUntil: '2099-11-30',
  }]} />);
  expect(document.querySelector('.rtw-sched-note')?.textContent).toContain('M・W');
});

test('unavailable schedule data still displays an explicit unknown note', () => {
  render(<RtwLegTable {...props} schedules={null} />);
  expect(document.querySelector('.rtw-sched-note')?.textContent).toContain('unknown');
});

test('an ineligible imported operator remains visible instead of showing the first eligible choice', () => {
  render(<RtwLegTable {...props} legs={[{ from: 'TPE', to: 'NRT', operatingCarrier: 'CX', stopover: true, departsOn: '2099-11-02' }]} schedules={null} />);
  const select = document.querySelector<HTMLSelectElement>('select');
  expect(select?.value).toBe('CX');
  expect(select?.getAttribute('aria-invalid')).toBe('true');
});

test('surface transport suppresses schedule claims and disables the operator', () => {
  render(<RtwLegTable {...props} legs={[{ from: 'TPE', to: 'NRT', surface: true, stopover: true }]} schedules={null} />);
  expect(document.querySelector('.rtw-sched-note')).toBeNull();
  expect(document.querySelector('.rtw-leg-surface-operator')?.textContent).toContain('Surface');
  expect(document.querySelector<HTMLSelectElement>('td:nth-child(2) select')).toBeNull();
});

test('re-querying an existing leg keeps its operating carrier and selected flight number', () => {
  render(<RtwLegTable
    {...props}
    legs={[{ from: 'TPE', to: 'NRT', operatingCarrier: 'BR', stopover: true, departsOn: '2099-11-02', flightNumber: '024' }]}
    onFlightSelect={vi.fn()}
    schedules={null}
  />);
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-query-leg="0"]')!);
  expect(document.querySelector('[data-selected-flight="BR024"]')).toHaveTextContent('BR024');
});
