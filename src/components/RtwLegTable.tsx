import { useState } from 'react';
import {
  isFlightLeg,
  isSurfaceLeg,
  type Airline,
  type AirlineIata,
  type Airport,
  type Leg,
} from '../lib/types.ts';
import { useLocale } from '../i18n/use-locale.ts';
import { LegDateCalendar } from './LegDateCalendar.tsx';
import type { FlightSelection } from '../lib/schemas/dated-schedules.ts';
import type { OfficialScheduleCatalog } from '../lib/schemas/published-schedules.ts';
import { FlightDatesPanel } from './FlightDatesPanel.tsx';
import {
  humanizeDays,
  operatingDaysForDate,
  todayIso,
  type ScheduleLike,
} from '../lib/rtw/schedule-days.ts';

interface RtwLegTableProps {
  readonly airports: ReadonlyArray<Airport>;
  readonly legs: ReadonlyArray<Leg>;
  readonly onFlightSelect?: (legIndex: number, flight: FlightSelection) => void;
  readonly schedules: ReadonlyArray<ScheduleLike> | null;
  readonly officialSchedules?: OfficialScheduleCatalog | null;
  readonly airlines: ReadonlyArray<Airline>;
  readonly onCarrierChange: (legIndex: number, carrier: AirlineIata) => void;
  readonly onStopoverChange: (legIndex: number, stopover: boolean | undefined) => void;
  readonly onSurfaceChange: (legIndex: number, surface: boolean) => void;
  readonly onDateChange: (legIndex: number, iso: string | undefined) => void;
}

export function RtwLegTable({
  airports,
  legs,
  onFlightSelect,
  schedules,
  officialSchedules,
  airlines,
  onCarrierChange,
  onStopoverChange,
  onSurfaceChange,
  onDateChange,
}: RtwLegTableProps): React.ReactElement | null {
  const { locale, t } = useLocale();
  const [openDateLeg, setOpenDateLeg] = useState<number | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{ index: number; from: string; to: string } | null>(null);
  const scheduleLeg = scheduleTarget ? legs[scheduleTarget.index] : undefined;
  if (airports.length < 2) return null;

  return (
    <section className="rtw-leg-table-wrap" aria-label={locale === 'zh-TW' ? '環球票航段詳情' : 'RTW leg details'}>
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
              const leg = legs[index];
              if (!to || !leg) return null;
              const flight = isFlightLeg(leg) ? leg : null;
              const surface = isSurfaceLeg(leg);
              // Use the planned date, not today's possibly different season.
              const scheduleDays = flight
                ? operatingDaysForDate(
                    schedules,
                    flight.operatingCarrier,
                    from.iata,
                    to.iata,
                    flight.departsOn ?? todayIso(),
                  )
                : null;
              return (
                <tr key={`${from.iata}-${to.iata}-${index}`}>
                  <td>
                    <span className="rtw-leg-route">
                      {from.iata} → {to.iata}
                    </span>
                    {flight?.flightNumber && <small className="rtw-flight-reference" data-flight-number={`${flight.operatingCarrier}${flight.flightNumber}`}>
                      {flight.operatingCarrier}{flight.flightNumber} · {t('flights.savedReference')}
                    </small>}
                    <span className="rtw-leg-city">
                      {from.city} to {to.city}
                    </span>
                  </td>
                  <td>
                    {surface ? (
                      <span className="rtw-leg-surface-operator">{t('rtw.timing.surface')}</span>
                    ) : flight ? (
                      <select
                        value={flight.operatingCarrier}
                        onChange={(event) => onCarrierChange(index, event.target.value.toUpperCase())}
                        aria-label={t('rtw.legTable.operatingLabel', { from: from.iata, to: to.iata })}
                        aria-invalid={!airlines.some((airline) => airline.iata === flight.operatingCarrier)}
                      >
                        {!airlines.some((airline) => airline.iata === flight.operatingCarrier) && (
                          <option value={flight.operatingCarrier}>
                            {flight.operatingCarrier} · {t('rtw.integrity.ineligibleCarrier')}
                          </option>
                        )}
                        {airlines.map((airline) => (
                          <option key={airline.iata} value={airline.iata}>
                            {airline.iata} · {airline.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </td>
                  <td className="rtw-leg-date-cell">
                    <button
                      type="button"
                      className={`rtw-leg-date-btn${flight?.departsOn !== undefined ? ' has-date' : ''}`}
                      aria-label={t('rtw.schedule.dateLabel', { index: index + 1 })}
                      disabled={!flight}
                      onClick={() =>
                        setOpenDateLeg((prev) => (prev === index ? null : index))
                      }
                    >
                      {flight?.departsOn ?? '—'}
                    </button>
                    {onFlightSelect && flight && <button type="button" className="rtw-query-leg-schedule"
                      data-query-leg={index} onClick={() => setScheduleTarget({ index, from: from.iata, to: to.iata })}>{t('flights.showDates')}</button>}
                    {flight && (
                      <span className="rtw-sched-note">
                        {scheduleDays === null
                          ? t('rtw.schedule.unknown')
                          : t('rtw.schedule.frequency', {
                              days: humanizeDays(scheduleDays, locale),
                            })}
                      </span>
                    )}
                    {openDateLeg === index && flight && (
                      <LegDateCalendar
                        value={flight.departsOn}
                        schedules={null}
                        carrier={flight.operatingCarrier}
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
                        leg.stopover === undefined
                          ? ''
                          : leg.stopover
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
                        checked={surface}
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
      {onFlightSelect && scheduleTarget && scheduleLeg && isFlightLeg(scheduleLeg) && airports[scheduleTarget.index]?.iata === scheduleTarget.from &&
        airports[scheduleTarget.index + 1]?.iata === scheduleTarget.to && (
        <FlightDatesPanel key={`${scheduleTarget.index}:${scheduleTarget.from}:${scheduleTarget.to}:${scheduleLeg.operatingCarrier}:${scheduleLeg.flightNumber ?? ''}`}
          from={scheduleTarget.from} to={scheduleTarget.to} initialDate={scheduleLeg.departsOn ?? todayIso()}
          carriers={new Set([scheduleLeg.operatingCarrier])}
          flightNumber={scheduleLeg.flightNumber}
          schedules={[]}
          {...(officialSchedules !== undefined ? { officialSchedules } : {})}
          onClose={() => setScheduleTarget(null)} onChoose={(flight) => { onFlightSelect(scheduleTarget.index, flight); setScheduleTarget(null); }} />
      )}
    </section>
  );
}
