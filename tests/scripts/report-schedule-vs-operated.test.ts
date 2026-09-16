import { describe, expect, test } from 'vitest';
import { buildDriftReport } from '../../scripts/report-schedule-vs-operated.ts';

const services = [
  {
    carrier: 'BR', flightNumber: '67', from: 'TPE', to: 'BKK',
    date: '2026-09-08', departureTime: '08:15', arrivalTime: '11:20', sourceId: 's1',
  },
  {
    carrier: 'BR', flightNumber: '198', from: 'TPE', to: 'NRT',
    date: '2026-11-02', departureTime: '08:50', arrivalTime: '12:55', sourceId: 's2',
  },
] as const;

describe('schedule-vs-operated drift report (P2 operational validation)', () => {
  test('marks missing flown observations as no-observation, never as drift', () => {
    const report = buildDriftReport(services as never, []);
    expect(report.summary.services).toBe(2);
    expect(report.summary.observed).toBe(0);
    expect(report.summary.noObservation).toBe(2);
    for (const row of report.rows) {
      expect(row.status).toBe('no-observation');
      expect(row.departureDriftMinutes).toBeNull();
      expect(row.arrivalDriftMinutes).toBeNull();
    }
  });

  test('computes drift only for an exact route+flight+date observation', () => {
    const report = buildDriftReport(services as never, [
      {
        flightNumber: '67', from: 'TPE', to: 'BKK',
        date: '2026-09-08', departureUtc: '08:45', arrivalUtc: '11:05',
        note: 'observed', observedAt: '2026-09-08',
      },
    ]);
    const br67 = report.rows.find((row) => row.flightNumber === 'BR67')!;
    const br198 = report.rows.find((row) => row.flightNumber === 'BR198')!;
    // +30 min departure, -15 min arrival for the observed flight.
    expect(br67.status).toBe('observed');
    expect(br67.departureDriftMinutes).toBe(30);
    expect(br67.arrivalDriftMinutes).toBe(-15);
    // The other flight has no observation.
    expect(br198.status).toBe('no-observation');
    expect(report.summary.observed).toBe(1);
    expect(report.summary.meanDepartureDriftMinutes).toBe(30);
    expect(report.summary.meanArrivalDriftMinutes).toBe(-15);
  });

  test('does not match a same flight number on a different date/route', () => {
    const report = buildDriftReport(services as never, [
      {
        flightNumber: '67', from: 'TPE', to: 'BKK',
        date: '2026-09-21', departureUtc: '08:45', arrivalUtc: '11:05',
        note: 'future observation', observedAt: '2026-09-21',
      },
    ]);
    expect(report.rows.every((row) => row.status === 'no-observation')).toBe(true);
  });
});