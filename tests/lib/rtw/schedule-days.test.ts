/**
 * Pins for the UI-side schedule lookups (src/lib/rtw/schedule-days.ts).
 *
 * These mirror the ENGINE's schedule-day-mismatch window semantics
 * (docs/decisions/flight-schedule-model.md S4): directional ordered pairs,
 * window-aware activation (validity bounds + wrap-around seasons),
 * unknown ≠ nothing-flies, suspended rows silent.
 */
import { describe, expect, test } from 'vitest';
import {
  humanizeDays,
  isScheduleActiveOn,
  isoWeekday,
  operatingDaysForDate,
  seasonContains,
  todayIso,
  type ScheduleLike,
} from '../../../src/lib/rtw/schedule-days.ts';

function entry(overrides: Partial<ScheduleLike>): ScheduleLike {
  return {
    carrier: 'BR',
    pair: ['TPE', 'SFO'],
    daysOfWeek: [1, 3, 5],
    status: 'operating',
    ...overrides,
  };
}

describe('isoWeekday', () => {
  test('maps ISO dates to 1=Mon … 7=Sun', () => {
    expect(isoWeekday('2024-01-01')).toBe(1); // Monday
    expect(isoWeekday('2024-01-07')).toBe(7); // Sunday
    expect(isoWeekday('2026-02-14')).toBe(6); // Saturday
  });

  test('is UTC-safe across leap days and year boundaries', () => {
    expect(isoWeekday('2024-02-29')).toBe(4); // Thursday
    expect(isoWeekday('2025-01-01')).toBe(3); // Wednesday
    expect(isoWeekday('2026-01-01')).toBe(4); // Thursday
  });

  test('returns 0 on garbage instead of throwing', () => {
    expect(isoWeekday('not-a-date')).toBe(0);
  });
});

describe('todayIso', () => {
  test('returns a YYYY-MM-DD UTC string', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('seasonContains', () => {
  test('no window means always contained', () => {
    expect(seasonContains(undefined, undefined, '2026-07-04')).toBe(true);
    expect(seasonContains(undefined, undefined, '2026-12-31')).toBe(true);
  });

  test('normal window contains interior dates only', () => {
    expect(seasonContains('06-01', '08-31', '2026-07-15')).toBe(true);
    expect(seasonContains('06-01', '08-31', '2026-09-01')).toBe(false);
    expect(seasonContains('06-01', '08-31', '2026-05-31')).toBe(false);
  });

  test('wrapping window spans the northern-hemisphere winter', () => {
    expect(seasonContains('10-01', '03-31', '2026-12-25')).toBe(true);
    expect(seasonContains('10-01', '03-31', '2026-02-14')).toBe(true);
    expect(seasonContains('10-01', '03-31', '2026-07-04')).toBe(false);
  });

  test('single-sided bounds behave inclusively', () => {
    expect(seasonContains('03-01', undefined, '2026-05-05')).toBe(true);
    expect(seasonContains('03-01', undefined, '2026-01-10')).toBe(false);
    expect(seasonContains(undefined, '11-30', '2026-11-29')).toBe(true);
    expect(seasonContains(undefined, '11-30', '2026-12-01')).toBe(false);
  });
});

describe('isScheduleActiveOn', () => {
  test('suspended rows are never active', () => {
    const row = entry({ status: 'suspended' });
    expect(isScheduleActiveOn(row, '2026-02-09')).toBe(false);
  });

  test('validity bounds exclude out-of-range dates', () => {
    expect(
      isScheduleActiveOn(entry({ effectiveFrom: '2026-03-29' }), '2026-03-28'),
    ).toBe(false);
    expect(
      isScheduleActiveOn(entry({ effectiveFrom: '2026-03-29' }), '2026-03-29'),
    ).toBe(true);
    expect(
      isScheduleActiveOn(entry({ effectiveUntil: '2025-03-29' }), '2026-02-09'),
    ).toBe(false);
  });

  test('null effectiveUntil stays open-ended', () => {
    expect(
      isScheduleActiveOn(entry({ effectiveUntil: null }), '2030-01-01'),
    ).toBe(true);
  });

  test('season window must contain the date', () => {
    expect(
      isScheduleActiveOn(entry({ seasonStart: '10-01', seasonEnd: '03-31' }), '2026-12-25'),
    ).toBe(true);
    expect(
      isScheduleActiveOn(entry({ seasonStart: '10-01', seasonEnd: '03-31' }), '2026-07-04'),
    ).toBe(false);
  });
});

describe('operatingDaysForDate', () => {
  test('returns null without a catalog, carrier, or matching row', () => {
    expect(operatingDaysForDate(null, 'BR', 'TPE', 'SFO', '2026-05-04')).toBeNull();
    expect(operatingDaysForDate([entry({})], '', 'TPE', 'SFO', '2026-05-04')).toBeNull();
    expect(operatingDaysForDate([entry({})], 'BR', 'TPE', 'KIX', '2026-05-04')).toBeNull();
  });

  test('never reverses the ordered pair', () => {
    expect(operatingDaysForDate([entry({})], 'BR', 'SFO', 'TPE', '2026-05-04')).toBeNull();
  });

  test('all-suspended or all-out-of-window candidates yield null (unknown ≠ empty)', () => {
    expect(
      operatingDaysForDate(
        [entry({ status: 'suspended' })],
        'BR',
        'TPE',
        'SFO',
        '2026-05-04',
      ),
    ).toBeNull();
    expect(
      operatingDaysForDate(
        [entry({ effectiveUntil: '2025-03-29' })],
        'BR',
        'TPE',
        'SFO',
        '2026-05-04',
      ),
    ).toBeNull();
  });

  test('the row active on the queried date wins among seasonal siblings', () => {
    const winter = entry({
      daysOfWeek: [1, 3],
      effectiveFrom: '2025-10-01',
      effectiveUntil: '2026-03-31',
    });
    const summer = entry({
      daysOfWeek: [2, 4],
      effectiveFrom: '2026-04-01',
      effectiveUntil: null,
    });
    expect(operatingDaysForDate([winter, summer], 'BR', 'TPE', 'SFO', '2026-02-09')).toEqual(
      new Set([1, 3]),
    );
    expect(operatingDaysForDate([winter, summer], 'BR', 'TPE', 'SFO', '2026-05-04')).toEqual(
      new Set([2, 4]),
    );
  });
});

describe('humanizeDays', () => {
  test('emits ISO-order chips joined with ·', () => {
    expect(humanizeDays(new Set([1, 3, 5]), 'en')).toBe('M・W・F');
  });

  test('accepts plain arrays identically to Sets', () => {
    expect(humanizeDays([1, 3, 5], 'en')).toBe('M・W・F');
    expect(humanizeDays([5, 1, 3], 'en')).toBe('M・W・F');
  });

  test('uses native narrow weekday names for zh-TW', () => {
    expect(humanizeDays(new Set([1, 3, 5]), 'zh-TW')).toBe('一・三・五');
    expect(humanizeDays(new Set([7]), 'zh-TW')).toBe('日');
  });
});
