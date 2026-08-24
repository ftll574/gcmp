/**
 * Component tests for LegDateCalendar — the custom month-grid date picker
 * (docs/decisions/flight-schedule-model.md §S5). Native <input type="date">
 * cannot disable individual days, so the component hard-disables
 * non-operating days ONLY for catalog-covered pairs and keeps uncovered
 * pairs fully editable ("班表未知" never blocks input).
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { LegDateCalendar } from '../../src/components/LegDateCalendar.tsx';
import { setLocale } from '../../src/i18n/i18n.ts';
import type { ScheduleLike } from '../../src/lib/rtw/schedule-days.ts';

afterEach(cleanup);

const BR_TPE_NRT_MON_WED_FRI: ReadonlyArray<ScheduleLike> = [
  {
    carrier: 'BR',
    pair: ['TPE', 'NRT'],
    daysOfWeek: [1, 3, 5],
    status: 'operating',
  },
];

function renderCalendar(overrides: {
  value?: string;
  schedules?: ReadonlyArray<ScheduleLike> | null;
  onChange?: (iso: string | undefined) => void;
}): void {
  render(
    <LegDateCalendar
      value={overrides.value}
      schedules={overrides.schedules === undefined ? BR_TPE_NRT_MON_WED_FRI : overrides.schedules}
      carrier="BR"
      fromIata="TPE"
      toIata="NRT"
      onChange={overrides.onChange ?? vi.fn()}
      onClose={vi.fn()}
      ariaLabel="Pick departure date for leg 1"
    />,
  );
}

describe('LegDateCalendar', () => {
  test('renders a month grid with narrow weekday headers (Mon-first)', () => {
    setLocale('en');
    renderCalendar({ value: '2026-02-09' });

    // February 2026 starts on a Sunday → one leading blank cell.
    const grid = document.querySelector('.rtw-cal-grid');
    expect(grid).not.toBeNull();
    expect(grid?.querySelectorAll('.rtw-cal-dow')).toHaveLength(7);
    expect(screen.getByText('February 2026')).toBeInTheDocument();
  });

  test('disables non-operating days only for catalog-covered pairs', () => {
    setLocale('en');
    renderCalendar({ value: '2026-02-09' }); // Monday

    expect(
      screen.getByRole('button', { name: /February 9, 2026/ }),
    ).toBeEnabled(); // Mon
    expect(
      screen.getByRole('button', { name: /February 10, 2026/ }),
    ).toBeDisabled(); // Tue — verifiably not served
    expect(screen.getByRole('button', { name: /February 11, 2026/ })).toBeEnabled();
  });

  test('uncovered pairs keep every day enabled (schedule unknown never blocks)', () => {
    setLocale('en');
    renderCalendar({ schedules: [], value: '2026-02-09' });

    expect(screen.getByRole('button', { name: /February 10, 2026/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /February 14, 2026/ })).toBeEnabled();
  });

  test('null catalog keeps every day enabled', () => {
    setLocale('en');
    renderCalendar({ schedules: null, value: '2026-02-09' });

    expect(screen.getByRole('button', { name: /February 10, 2026/ })).toBeEnabled();
  });

  test('picking an operating day reports its ISO date and closes', () => {
    setLocale('en');
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <LegDateCalendar
        value="2026-02-09"
        schedules={BR_TPE_NRT_MON_WED_FRI}
        carrier="BR"
        fromIata="TPE"
        toIata="NRT"
        onChange={onChange}
        onClose={onClose}
        ariaLabel="Pick departure date for leg 1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /February 13, 2026/ })); // Friday
    expect(onChange).toHaveBeenCalledWith('2026-02-13');
    expect(onClose).toHaveBeenCalled();
  });

  test('clear button appears only when a date is set', () => {
    setLocale('en');
    const onChange = vi.fn();
    const { rerender } = render(
      <LegDateCalendar
        value="2026-02-09"
        schedules={BR_TPE_NRT_MON_WED_FRI}
        carrier="BR"
        fromIata="TPE"
        toIata="NRT"
        onChange={onChange}
        onClose={vi.fn()}
        ariaLabel="Pick departure date for leg 1"
      />,
    );
    fireEvent.click(screen.getByText('Clear date'));
    expect(onChange).toHaveBeenCalledWith(undefined);

    rerender(
      <LegDateCalendar
        value={undefined}
        schedules={BR_TPE_NRT_MON_WED_FRI}
        carrier="BR"
        fromIata="TPE"
        toIata="NRT"
        onChange={onChange}
        onClose={vi.fn()}
        ariaLabel="Pick departure date for leg 1"
      />,
    );
    expect(screen.queryByText('Clear date')).toBeNull();
  });

  test('offers the jump-to-next-operating-day quick-fix on verifiably unserved dates', () => {
    setLocale('en');
    const onChange = vi.fn();
    render(
      <LegDateCalendar
        value="2026-02-10" // Tuesday — catalog serves Mon/Wed/Fri only
        schedules={BR_TPE_NRT_MON_WED_FRI}
        carrier="BR"
        fromIata="TPE"
        toIata="NRT"
        onChange={onChange}
        onClose={vi.fn()}
        ariaLabel="Pick departure date for leg 1"
      />,
    );

    const fix = screen.getByText('Jump to next operating day');
    fireEvent.click(fix);
    expect(onChange).toHaveBeenCalledWith('2026-02-11'); // Wednesday
  });

  test('no quick-fix when the current date is served or the pair is unknown', () => {
    setLocale('en');
    const { container: served } = render(
      <LegDateCalendar
        value="2026-02-09" // Monday — served
        schedules={BR_TPE_NRT_MON_WED_FRI}
        carrier="BR"
        fromIata="TPE"
        toIata="NRT"
        onChange={vi.fn()}
        onClose={vi.fn()}
        ariaLabel="Pick departure date for leg 1"
      />,
    );
    expect(served.ownerDocument?.body.textContent).not.toContain('Jump to next operating day');
    cleanup();

    const { container: unknown } = render(
      <LegDateCalendar
        value="2026-02-10"
        schedules={[]}
        carrier="BR"
        fromIata="TPE"
        toIata="NRT"
        onChange={vi.fn()}
        onClose={vi.fn()}
        ariaLabel="Pick departure date for leg 1"
      />,
    );
    expect(unknown.ownerDocument?.body.textContent).not.toContain('Jump to next operating day');
  });

  test('renders native zh-TW chrome strings', () => {
    setLocale('zh-TW');
    renderCalendar({ value: '2026-02-09' });

    expect(screen.getByText('關閉')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上個月' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下個月' })).toBeInTheDocument();
    expect(screen.getByText('2026年2月')).toBeInTheDocument();
  });
});
