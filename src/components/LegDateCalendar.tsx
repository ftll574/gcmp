/**
 * LegDateCalendar — month-grid picker for a single leg's `departsOn` date.
 *
 * Why not `<input type="date">`: it cannot disable individual days. The
 * schedule model (docs/decisions/flight-schedule-model.md §S5) requires
 * hard-preventing non-operating days ONLY for schedule-catalog-covered
 * pairs; uncovered pairs stay fully editable (the "班表未知" state never
 * blocks input — never dress ignorance as fact).
 *
 * Disabling is PER-DATE via operatingDaysForDate(): a row only bites when
 * it is verifiably active on the day being picked (validity + season
 * windows enforced), so expired timetables never block. Weekday headers
 * and month labels come from Intl — no i18n keys for those.
 *
 * Conventions:
 *   - Weekday: ISO 1=Mon … 7=Sun everywhere (matches ScheduleEntrySchema).
 *   - All date math is UTC-based so ISO strings never drift a day.
 *
 * This file exports the component ONLY (react-refresh); shared date
 * helpers live in src/lib/rtw/schedule-days.ts.
 */

import { useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import {
  isoWeekday,
  operatingDaysForDate,
  type ScheduleLike,
} from '../lib/rtw/schedule-days.ts';

function parseIsoParts(iso: string): { y: number; m: number; d: number } | null {
  const parts = iso.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (
    y === undefined ||
    m === undefined ||
    d === undefined ||
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d)
  ) {
    return null;
  }
  return { y, m, d };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isoFromUtc(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

interface LegDateCalendarProps {
  /** Current per-leg date (YYYY-MM-DD) or undefined when undated. */
  readonly value: string | undefined;
  /** Schedule catalog (may be null = feature data unavailable). */
  readonly schedules: ReadonlyArray<ScheduleLike> | null;
  /** Ordered pair context of THIS leg — schedules are directional. */
  readonly carrier: string;
  readonly fromIata: string;
  readonly toIata: string;
  readonly onChange: (iso: string | undefined) => void;
  readonly onClose: () => void;
  /** Accessible name for the dialog (parent supplies leg context). */
  readonly ariaLabel: string;
}

/** Anchor dates 2024-01-01(Mon)…07(Sun) for Intl narrow weekday headers. */
const WEEKDAY_ANCHORS: ReadonlyArray<Date> = [0, 1, 2, 3, 4, 5, 6].map((i) =>
  new Date(Date.UTC(2024, 0, 1 + i)),
);

export function LegDateCalendar({
  value,
  schedules,
  carrier,
  fromIata,
  toIata,
  onChange,
  onClose,
  ariaLabel,
}: LegDateCalendarProps): React.ReactElement {
  const { locale, t } = useLocale();

  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const parsed = value ? parseIsoParts(value) : null;
    if (parsed) return { y: parsed.y, m: parsed.m };
    const now = new Date();
    return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 };
  });

  const monthFormatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const dayFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeZone: 'UTC',
  });
  const narrowFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'narrow',
    timeZone: 'UTC',
  });

  const leading = (new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();

  const cells: ReadonlyArray<string | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoFromUtc(view.y, view.m, i + 1)),
  ];

  function daysFor(iso: string): ReadonlySet<number> | null {
    if (!schedules) return null;
    return operatingDaysForDate(schedules, carrier, fromIata, toIata, iso);
  }

  // Quick-fix applies when the CURRENT value falls on a day the catalog
  // verifiably does not serve (active entry, weekday not operated).
  let nextAvailable: string | null = null;
  if (value !== undefined && schedules !== null) {
    const current = daysFor(value);
    if (current !== null && !current.has(isoWeekday(value))) {
      const parsed = parseIsoParts(value);
      if (parsed) {
        const baseMs = Date.UTC(parsed.y, parsed.m - 1, parsed.d);
        for (let n = 1; n <= 366; n++) {
          const cand = new Date(baseMs + n * 86400000);
          const iso = isoFromUtc(
            cand.getUTCFullYear(),
            cand.getUTCMonth() + 1,
            cand.getUTCDate(),
          );
          const candDays = daysFor(iso);
          if (candDays !== null && candDays.has(isoWeekday(iso))) {
            nextAvailable = iso;
            break;
          }
        }
      }
    }
  }

  function shiftMonth(delta: number): void {
    setView((prev) => {
      const shifted = new Date(Date.UTC(prev.y, prev.m - 1 + delta, 1));
      return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1 };
    });
  }

  return (
    <div className="rtw-cal" role="dialog" aria-label={ariaLabel}>
      <div className="rtw-cal-head">
        <button
          type="button"
          className="rtw-cal-nav"
          aria-label={t('rtw.schedule.prevMonth')}
          onClick={() => shiftMonth(-1)}
        >
          ‹
        </button>
        <span className="rtw-cal-month">
          {monthFormatter.format(new Date(Date.UTC(view.y, view.m - 1, 1)))}
        </span>
        <button
          type="button"
          className="rtw-cal-nav"
          aria-label={t('rtw.schedule.nextMonth')}
          onClick={() => shiftMonth(1)}
        >
          ›
        </button>
      </div>
      <div className="rtw-cal-grid" role="presentation">
        {WEEKDAY_ANCHORS.map((anchor) => (
          <span key={anchor.toISOString()} className="rtw-cal-dow">
            {narrowFormatter.format(anchor)}
          </span>
        ))}
        {cells.map((iso, index) =>
          iso === null ? (
            <span key={`blank-${index}`} className="rtw-cal-blank" />
          ) : (
            (() => {
              const days = daysFor(iso);
              const disabled = days !== null && !days.has(isoWeekday(iso));
              const longLabel = dayFormatter.format(new Date(`${iso}T00:00:00Z`));
              return (
                <button
                  key={iso}
                  type="button"
                  className={`rtw-cal-day${value === iso ? ' rtw-cal-day-selected' : ''}`}
                  disabled={disabled}
                  title={
                    disabled
                      ? `${longLabel} · ${t('rtw.schedule.noFlight')}`
                      : longLabel
                  }
                  aria-label={`${longLabel}${disabled ? ` · ${t('rtw.schedule.noFlight')}` : ''}`}
                  aria-pressed={value === iso}
                  onClick={() => {
                    onChange(iso);
                    onClose();
                  }}
                >
                  {Number(iso.slice(8))}
                </button>
              );
            })()
          ),
        )}
      </div>
      <div className="rtw-cal-foot">
        {value !== undefined && (
          <button type="button" className="rtw-cal-action" onClick={() => onChange(undefined)}>
            {t('rtw.schedule.clear')}
          </button>
        )}
        {nextAvailable !== null && (
          <button
            type="button"
            className="rtw-cal-action rtw-cal-fix"
            onClick={() => {
              onChange(nextAvailable);
              onClose();
            }}
          >
            {t('rtw.schedule.nextAvailable')}
          </button>
        )}
        <button type="button" className="rtw-cal-action" onClick={onClose}>
          {t('rtw.schedule.close')}
        </button>
      </div>
    </div>
  );
}
