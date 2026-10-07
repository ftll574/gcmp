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
import { dgcaDraftDateStatus } from '../lib/schemas/dgca-schedule-evidence.ts';
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
  readonly onCarrierChange: (legIndex: number, carrier: AirlineIata | undefined) => void;
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
                && flight.operatingCarrier
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
                    {flight?.carrierAssumed && <small className="rtw-flight-reference is-assumed">{t('rtw.legChip.assumedCarrier')}</small>}
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
                      <>
                        <select
                          value={flight.operatingCarrier ?? ''}
                          onChange={(event) => onCarrierChange(index, event.target.value === '' ? undefined : event.target.value.toUpperCase())}
                          aria-label={t('rtw.legTable.operatingLabel', { from: from.iata, to: to.iata })}
                          aria-invalid={Boolean(flight.operatingCarrier && !airlines.some((airline) => airline.iata === flight.operatingCarrier))}
                        >
                          {flight.dgcaScheduleReference && <option value="">{locale === 'zh-TW' ? '營運航空公司未知' : 'Operating airline unknown'}</option>}
                          {flight.operatingCarrier && !airlines.some((airline) => airline.iata === flight.operatingCarrier) && (
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
                        {flight.dgcaScheduleReference && <details className="rtw-dgca-reference" data-dgca-draft-reference>
                          <summary>{flight.dgcaScheduleReference.reference.designatorKey} · {locale === 'zh-TW' ? 'DGCA 來源身份參考' : 'DGCA source identity reference'}</summary>
                          <p>{locale === 'zh-TW' ? '僅為班表身份參考，不代表所選日期有航班或實際運航；DGCA 未提供時區，不推定起降時間或接駁可行性。' : 'Identity reference only; it does not establish a flight on this date or actual operation. DGCA timezone is unspecified, so arrival/departure timing and connection feasibility are not inferred.'}</p>
                          <p>{flight.dgcaScheduleReference.source.operator.carrierIdentityStatus === 'independently-mapped'
                            ? flight.dgcaScheduleReference.source.operator.qualification
                            : `${flight.dgcaScheduleReference.source.operator.qualification} ${locale === 'zh-TW' ? '營運者與聯盟身份仍未知。' : 'Operating-airline and alliance identity remain unknown.'}`}</p>
                          {flight.departsOn && (() => {
                            const status = dgcaDraftDateStatus(flight.dgcaScheduleReference.reference, flight.departsOn);
                            const label = status === 'outside-window'
                              ? (locale === 'zh-TW' ? '所選日期不在來源身份有效期間；不代表沒有航班。' : 'Selected date is outside the source identity window; this does not prove no flight exists.')
                              : status === 'weekday-supported'
                                ? (locale === 'zh-TW' ? '另源佐證的星期包含此日期；實際班次與運航仍未知。' : 'A separately corroborated weekday includes this date; service and actual operation remain unknown.')
                                : status === 'weekday-not-supported'
                                  ? (locale === 'zh-TW' ? '另源佐證的星期不包含此日期；請重新確認此來源參考。' : 'A separately corroborated weekday excludes this date; recheck this source reference.')
                                  : status === 'weekday-conflict'
                                    ? (locale === 'zh-TW' ? '來源頻率欄位衝突；星期未知。' : 'Source frequency fields conflict; weekday is unknown.')
                                    : (locale === 'zh-TW' ? '星期解讀未知；僅確認來源身份有效期間。' : 'Weekday interpretation is unknown; only the source identity window is established.');
                            return <p data-dgca-date-status={status}>{label}</p>;
                          })()}
                          {flight.dgcaScheduleReference.reference.variants.map(variant => <div key={variant.id}>
                            <p>{variant.effectiveFromRaw} → {variant.effectiveUntilRaw} · {variant.id}</p>
                            <p>{locale === 'zh-TW' ? '頻率原文' : 'Raw frequency'}: <code>{variant.frequencyRaw || '(blank)'}</code> · {locale === 'zh-TW' ? '時刻原文' : 'Raw clocks'}: <code>{[...variant.departureClockValuesRaw, '→', ...variant.arrivalClockValuesRaw].join(' ') || '(blank)'}</code> · {locale === 'zh-TW' ? '時區未知' : 'timezone unknown'}</p>
                            {variant.frequencyWeekdaysCorroborated.length > 0 && <p>{locale === 'zh-TW' ? 'AAI 另源星期註記（非 DGCA 定義）' : 'Separate AAI weekday annotation (not defined by DGCA)'}: {variant.frequencyWeekdaysCorroborated.join(', ')}</p>}
                            <p>{locale === 'zh-TW' ? '來源頁／列與雜湊' : 'Source page/row and hashes'}: {variant.sourceRows.map(row => `${row.referenceRaw} · p.${row.page}${row.physicalRow ? ` · row ${row.physicalRow}` : ''}${row.sourceRowSha256 ? ` · ${row.sourceRowSha256}` : ''}${row.sourceRowTextSha256 ? ` · ${row.sourceRowTextSha256}` : ''}`).join(' | ')}</p>
                            {(variant.conflictIds.length > 0 || variant.conflictFields.length > 0) && <p>{locale === 'zh-TW' ? '來源衝突' : 'Source conflicts'}: {variant.conflictKinds.join(', ')} · {variant.conflictFields.join(', ')} · {variant.conflictIds.join(', ')}</p>}
                          </div>)}
                          <p><a href={flight.dgcaScheduleReference.source.url} target="_blank" rel="noreferrer">{flight.dgcaScheduleReference.source.title} · {locale === 'zh-TW' ? '原始 DGCA PDF' : 'Original DGCA PDF'}</a> · SHA-256 <code>{flight.dgcaScheduleReference.source.pdfSha256}</code> · <a href={flight.dgcaScheduleReference.source.reusePolicyUrl} target="_blank" rel="noreferrer">{locale === 'zh-TW' ? '資料使用政策' : 'Reuse policy'}</a></p>
                        </details>}
                      </>
                    ) : null}
                  </td>
                  <td className="rtw-leg-date-cell">
                    {flight?.dgcaScheduleReference ? <input
                      type="date"
                      className={`rtw-leg-date-btn${flight.departsOn !== undefined ? ' has-date' : ''}`}
                      aria-label={t('rtw.schedule.dateLabel', { index: index + 1 })}
                      data-dgca-draft-date={index}
                      value={flight.departsOn ?? ''}
                      onChange={(event) => onDateChange(index, event.target.value || undefined)}
                    /> : <button
                      type="button"
                      className={`rtw-leg-date-btn${flight?.departsOn !== undefined ? ' has-date' : ''}`}
                      aria-label={t('rtw.schedule.dateLabel', { index: index + 1 })}
                      data-rtw-field={'date:' + index}
                      disabled={!flight}
                      onClick={() =>
                        setOpenDateLeg((prev) => (prev === index ? null : index))
                      }
                    >
                      {flight?.departsOn ?? '—'}
                    </button>}
                    {onFlightSelect && flight?.operatingCarrier && <button type="button" className="rtw-query-leg-schedule"
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
                    {openDateLeg === index && flight?.operatingCarrier && (
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
      {onFlightSelect && scheduleTarget && scheduleLeg && isFlightLeg(scheduleLeg) && scheduleLeg.operatingCarrier && airports[scheduleTarget.index]?.iata === scheduleTarget.from &&
        airports[scheduleTarget.index + 1]?.iata === scheduleTarget.to && (
        <FlightDatesPanel key={`${scheduleTarget.index}:${scheduleTarget.from}:${scheduleTarget.to}:${scheduleLeg.operatingCarrier}:${scheduleLeg.flightNumber ?? ''}`}
          from={scheduleTarget.from} to={scheduleTarget.to} initialDate={scheduleLeg.departsOn ?? todayIso()}
          carriers={new Set([scheduleLeg.operatingCarrier])}
          flightNumber={scheduleLeg.flightNumber}
          schedules={[]}
          {...(officialSchedules !== undefined ? { officialSchedules } : {})}
          onClose={() => setScheduleTarget(null)} onUsePlannedDate={(date) => { onDateChange(scheduleTarget.index, date); setScheduleTarget(null); }} onChoose={(flight) => { onFlightSelect(scheduleTarget.index, flight); setScheduleTarget(null); }} />
      )}
    </section>
  );
}
