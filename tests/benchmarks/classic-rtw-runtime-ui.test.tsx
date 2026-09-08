import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FlightDatesPanel } from '../../src/components/FlightDatesPanel.tsx';

const NOW = Date.parse('2026-09-09T00:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function queryMonth(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Query this month' }));
  await waitFor(() => expect(screen.queryByText('Checking published schedules…')).not.toBeInTheDocument());
}

describe('classic RTW dated flights in the product calendar', () => {
  test('TPE-NRT exposes BR198 on 2026-11-02 without a live schedule provider', async () => {
    const onChoose = vi.fn();
    render(<FlightDatesPanel
      from="TPE"
      to="NRT"
      initialDate="2026-11-02"
      carriers={new Set(['BR'])}
      schedules={[]}
      apiBase=""
      onChoose={onChoose}
      onClose={vi.fn()}
    />);

    expect(screen.getByRole('button', { name: 'Query this month' })).toBeEnabled();
    await queryMonth();
    expect(document.querySelector('[data-flight-date="2026-11-02"]')).toHaveAttribute('data-state', 'published');
    expect(document.querySelector('[data-published-flight="BR198"]')).toBeInTheDocument();
    expect(screen.getByText('2026-11-02 08:50 → 2026-11-02 12:55')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use this flight and date' }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({
      carrier: 'BR', flightNumber: '198', date: '2026-11-02', departureTime: '08:50', arrivalTime: '12:55',
    }));
  });

  test('EWR-LHR exposes the cross-day UA14 occurrence on 2026-11-08', async () => {
    render(<FlightDatesPanel
      from="EWR"
      to="LHR"
      initialDate="2026-11-08"
      carriers={new Set(['UA'])}
      schedules={[]}
      apiBase=""
      onChoose={vi.fn()}
      onClose={vi.fn()}
    />);

    await queryMonth();
    expect(document.querySelector('[data-flight-date="2026-11-08"]')).toHaveAttribute('data-state', 'published');
    expect(document.querySelector('[data-published-flight="UA14"]')).toBeInTheDocument();
    expect(screen.getByText('2026-11-08 20:00 → 2026-11-09 08:25')).toBeInTheDocument();
  });

  test('the normal /api path falls back to BR198 when the live gateway is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    render(<FlightDatesPanel
      from="TPE"
      to="NRT"
      initialDate="2026-11-02"
      carriers={new Set(['BR'])}
      schedules={[]}
      apiBase="/api"
      onChoose={vi.fn()}
      onClose={vi.fn()}
    />);

    await queryMonth();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(document.querySelector('[data-flight-date="2026-11-02"]')).toHaveAttribute('data-state', 'published');
    expect(document.querySelector('[data-published-flight="BR198"]')).toBeInTheDocument();
  });
});
