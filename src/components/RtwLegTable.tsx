import { useState } from 'react';
import type { Airline, AirlineIata, Airport } from '../lib/types.ts';
import { useLocale } from '../i18n/use-locale.ts';
import { LegDateCalendar } from './LegDateCalendar.tsx';
import {
  humanizeDays,
  operatingDaysForDate,
  todayIso,
  type ScheduleLike,
} from '../lib/rtw/schedule-days.ts';

interface RtwLegTableProps {
  readonly airports: ReadonlyArray<Airport>;
  readonly operatingCarriers: ReadonlyArray<AirlineIata>;
  readonly stopovers: ReadonlyArray<boolean | undefined>;
  readonly surfaces: ReadonlyArray<boolean | undefined>;
  readonly departsOn: ReadonlyArray<string | undefined>;
  readonly schedules: ReadonlyArray<ScheduleLike> | null;
  readonly airlines: ReadonlyArray<Airline>;
  readonly onCarrierChange: (legIndex: number, carrier: AirlineIata) => void;
  readonly onStopoverChange: (legIndex: number, stopover: boolean | undefined) => void;
  readonly onSurfaceChange: (legIndex: number, surface: boolean) => void;
  readonly onDateChange: (legIndex: number, iso: string | undefined) => void;
}

export function RtwLegTable({
  airports,
  operatingCarriers,
  stopovers,
  surfaces,
  departsOn,
  schedules,
  airlines,
  onCarrierChange,
  onStopoverChange,
  onSurfaceChange,
  onDateChange,
}: RtwLegTableProps): React.ReactElement | null {
  const { locale, t } = useLocale();
  const [openDateLeg, setOpenDateLeg] = useState<number | null>(null);
  if (airports.length < 2) return null;

  return (
    <section className="rtw-leg-table-wrap" aria-label="RTW leg details">
      <div className="rtw-leg-table-heading">
        <div>
          <p className="rtw-eyebrow">{t('rtw.legTable.eyebrow')}</p>
          <h2>{t('rtw.legTable.title')}</h2>
        </div>
      </div>
      <div className="rtw-leg-table-scroll">
        <table className="rtw-leg-table">
          <thead>
            <tr>
              <th>{t('rtw.legTable.leg')}</th>
              <th>{t('rtw.legTable.operating')}</th>
              <th>{t('rtw.legTable.date')}</th>
              <th>{t('rtw.legTable.timing')}</th>
              <th>{t('rtw.legTable.surface')}</th>
            </tr>
          </thead>
          <tbody>
            {airports.slice(0, -1).map((from, index) => {
              const to = airports[index + 1];
              if (!to) return null;
              // Chip reflects the schedule ACTIVE TODAY (window-aware);
              // per-date disabling happens inside the calendar itself.
              const scheduleDays = operatingDaysForDate(
                schedules,
                operatingCarriers[index] ?? '',
                from.iata,
                to.iata,
                todayIso(),
              );
              return (
                <tr key={`${from.iata}-${to.iata}-${index}`}>
                  <td>
                    <span className="rtw-leg-route">
                      {from.iata} → {to.iata}
                    </span>
                    <span className="rtw-leg-city">
                      {from.city} to {to.city}
                    </span>
                  </td>
                  <td>
                    <select
                      value={operatingCarriers[index] ?? 'AA'}
                      onChange={(event) => onCarrierChange(index, event.target.value.toUpperCase())}
                      disabled={surfaces[index] === true}
                      aria-label={t('rtw.legTable.operatingLabel', { from: from.iata, to: to.iata })}
                    >
                      {airlines.map((airline) => (
                        <option key={airline.iata} value={airline.iata}>
                          {airline.iata}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="rtw-leg-date-cell">
                    <button
                      type="button"
                      className={`rtw-leg-date-btn${departsOn[index] !== undefined ? ' has-date' : ''}`}
                      aria-label={t('rtw.schedule.dateLabel', { index: index + 1 })}
                      disabled={surfaces[index] === true}
                      onClick={() =>
                        setOpenDateLeg((prev) => (prev === index ? null : index))
                      }
                    >
                      {departsOn[index] ?? '—'}
                    </button>
                    {schedules !== null && surfaces[index] !== true && (
                      <span className="rtw-sched-note">
                        {scheduleDays === null
                          ? t('rtw.schedule.unknown')
                          : t('rtw.schedule.frequency', {
                              days: humanizeDays(scheduleDays, locale),
                            })}
                      </span>
                    )}
                    {openDateLeg === index && (
                      <LegDateCalendar
                        value={departsOn[index]}
                        schedules={schedules}
                        carrier={operatingCarriers[index] ?? ''}
                        fromIata={from.iata}
                        toIata={to.iata}
                        onChange={(iso) => onDateChange(index, iso)}
                        onClose={() => setOpenDateLeg(null)}
                        ariaLabel={t('rtw.schedule.dateLabel', { index: index + 1 })}
                      />
                    )}
                  </td>
                  <td>
                    <select
                      aria-label={t('rtw.legTable.timingLabel', { from: from.iata, to: to.iata })}
                      value={
                        stopovers[index] === undefined
                          ? ''
                          : stopovers[index]
                            ? 'stopover'
                            : 'transfer'
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        onStopoverChange(index, value === '' ? undefined : value === 'stopover');
                      }}
                    >
                      <option value="">{t('rtw.timing.unknown')}</option>
                      <option value="transfer">{t('rtw.timing.transferLong')}</option>
                      <option value="stopover">{t('rtw.timing.stopoverLong')}</option>
                    </select>
                  </td>
                  <td>
                    <label className="rtw-leg-surface-toggle">
                      <input
                        type="checkbox"
                        aria-label={t('rtw.legTable.surfaceLabel', { from: from.iata, to: to.iata })}
                        checked={surfaces[index] === true}
                        onChange={(event) => onSurfaceChange(index, event.target.checked)}
                      />
                      {t('rtw.timing.surface')}
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
