import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import { isCalendarDate, monthDates, shiftCalendarMonth } from '../lib/calendar-date.ts';
import { fetchFlightSchedules } from '../lib/flight-schedule-client.ts';
import { flightDayView } from '../lib/rtw/dated-flight-status.ts';
import { humanizeDays, todayIso } from '../lib/rtw/schedule-days.ts';
import type { DatedScheduleDay, FlightSelection, FlightQueryResponse } from '../lib/schemas/dated-schedules.ts';
import { officialScheduleCatalog } from '../lib/official-schedule-catalog.ts';
import { mergeOfficialSchedules, queryOfficialSchedules } from '../lib/rtw/official-schedules.ts';
import type { ScheduleEntry } from '../lib/schemas/flight-schedules.ts';
import type { TimetableReference } from '../lib/schemas/published-schedules.ts';
import './FlightDatesPanel.css';

interface Props {
  readonly from: string;
  readonly to: string;
  readonly initialDate: string;
  readonly carriers: ReadonlySet<string>;
  readonly schedules: ReadonlyArray<ScheduleEntry>;
  /** Optional operating flight-number suffix selected before date/time (e.g.
   * `024` for BR024). When present, the calendar/results are scoped to this
   * exact designator instead of mixing every flight on the city pair. */
  readonly flightNumber?: string | undefined;
  readonly onChoose: (flight: FlightSelection) => void;
  readonly onClose: () => void;
  /** Override for integration tests/local embedding; contains NO credentials. */
  readonly apiBase?: string;
}

function filterDayByFlightNumber(
  day: DatedScheduleDay | undefined,
  flightNumber: string | undefined,
): DatedScheduleDay | undefined {
  if (!day || !flightNumber) return day;
  return {
    ...day,
    flights: day.flights.filter((flight) => flight.flightNumber === flightNumber),
    ...(day.published ? {
      published: day.published.filter((flight) => flight.flightNumber === flightNumber),
    } : {}),
    ...(day.references ? {
      references: day.references.filter((flight) => flight.flightNumber === flightNumber),
    } : {}),
  };
}

/** An explicit query, never one request per route card/render. Network and
 * weekly reference catalogs cannot populate the verified calendar states. */
export function FlightDatesPanel({
  from, to, initialDate, carriers, schedules, flightNumber, onChoose, onClose, apiBase,
}: Props): React.ReactElement {
  const { locale, t } = useLocale();
  const base = apiBase ?? import.meta.env.VITE_SCHEDULE_API_BASE ?? '';
  const hasOfficialPair = officialScheduleCatalog.services.some((row) => row.from === from && row.to === to && carriers.has(row.carrier));
  const anchorDate = isCalendarDate(initialDate) ? initialDate : todayIso();
  const [month, setMonth] = useState(anchorDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(anchorDate);
  const [response, setResponse] = useState<FlightQueryResponse | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [clock, setClock] = useState(Date.now);
  const requestRef = useRef<AbortController | null>(null);
  const serial = useRef(0);
  const datePicked = useRef(false);
  const dates = useMemo(() => monthDates(month), [month]);
  const queryKey = `${from}:${to}:${month}`;
  const responseKey = response ? `${response.query.from}:${response.query.to}:${response.query.start.slice(0, 7)}` : null;
  const current = responseKey === queryKey ? response : null;
  const byDate = useMemo(() => new Map(current?.days.map((day) => [day.date, day]) ?? []), [current]);
  const views = new Map(dates.map((date) => [
    date,
    flightDayView(filterDayByFlightNumber(byDate.get(date), flightNumber), carriers, clock),
  ]));
  const chosen = views.get(selectedDate);
  const referenceDates = [...views.values()].filter((view) => view.references?.length).length;
  const referenceRows = schedules.filter((row) => row.pair[0] === from && row.pair[1] === to && carriers.has(row.carrier));
  const startPadding = (new Date(`${dates[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  const selectedDay = byDate.get(selectedDate);
  const selectedCarrier = carriers.size === 1 ? [...carriers][0] : undefined;
  const selectedFlightLabel = selectedCarrier && flightNumber
    ? `${selectedCarrier}${flightNumber}`
    : null;
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${dates[0]}T00:00:00Z`));

  useEffect(() => () => { serial.current++; requestRef.current?.abort(); }, []);
  // A displayed positive must expire even when the user leaves the page open.
  useEffect(() => {
    if (!current) return;
    const pendingExpiries = current.days.flatMap((day) => [Date.parse(day.expiresAt), ...[...(day.published ?? []), ...(day.references ?? [])].map((flight) => Date.parse(flight.source.reviewBy))]).filter((expiry) => expiry > clock);
    if (pendingExpiries.length === 0) return;
    const expiry = Math.min(...pendingExpiries);
    const timer = setTimeout(() => setClock(Date.now()), Math.max(1, expiry - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [current, clock]);

  function changeMonth(offset: number): void {
    serial.current++;
    requestRef.current?.abort();
    const next = shiftCalendarMonth(month, offset);
    datePicked.current = false;
    setMonth(next); setSelectedDate(`${next}-01`); setResponse(null); setState('idle'); setCopyState('idle');
  }

  const queryMonth = useCallback(async (): Promise<void> => {
    if (!base && !hasOfficialPair) return;
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    const id = ++serial.current;
    const timeout = setTimeout(() => controller.abort(), 70000);
    setState('loading'); setResponse(null); setCopyState('idle');
    try {
      const query = { from, to, start: dates[0]!, end: dates.at(-1)! };
      const fallback = queryOfficialSchedules(officialScheduleCatalog, query, Date.now());
      const primary = base ? await fetchFlightSchedules(base, query, controller.signal) : fallback;
      const next = base ? mergeOfficialSchedules(primary, fallback, Date.now()) : fallback;
      if (serial.current !== id) return;
      const receivedAt = Date.now();
      setClock(receivedAt); setResponse(next); setState('ready');
      // Request -> response must not replace a useful current date, or a
      // deliberate date click (including an unknown date) during the request.
      // Initial discovery can still show the first result when its anchor has
      // no evidence, but never turn an October 24 enquiry into October 1.
      if (!datePicked.current) {
        const first = next.days.find((day) => ['scheduled', 'published'].includes(
          flightDayView(filterDayByFlightNumber(day, flightNumber), carriers, receivedAt).status,
        )) ?? next.days.find((day) => flightDayView(
          filterDayByFlightNumber(day, flightNumber), carriers, receivedAt,
        ).references?.length);
        setSelectedDate((selected) => {
          const view = flightDayView(
            filterDayByFlightNumber(next.days.find((day) => day.date === selected), flightNumber),
            carriers,
            receivedAt,
          );
          return ['scheduled', 'published'].includes(view.status) || view.references?.length
            ? selected : first?.date ?? selected;
        });
      }
    } catch {
      if (serial.current === id) {
        setClock(Date.now());
        setResponse(queryOfficialSchedules(officialScheduleCatalog, { from, to, start: dates[0]!, end: dates.at(-1)! }, Date.now()));
        setState('error');
      }
    } finally { clearTimeout(timeout); }
  }, [base, hasOfficialPair, from, to, dates, carriers, flightNumber]);

  const choose = useCallback((flight: FlightSelection): void => {
    const fresh = flightDayView(
      filterDayByFlightNumber(byDate.get(selectedDate), flightNumber), carriers, Date.now(),
    );
    const matches = 'date' in flight
      ? fresh.published?.some((item) => item.carrier === flight.carrier && item.flightNumber === flight.flightNumber && item.date === flight.date && item.departureTime === flight.departureTime && item.arrivalTime === flight.arrivalTime && item.arrivalDate === flight.arrivalDate)
      : fresh.flights.some((item) => item.carrier === flight.carrier && item.flightNumber === flight.flightNumber && item.departureLocal === flight.departureLocal && item.arrivalLocal === flight.arrivalLocal);
    if (!matches) {
      setClock(Date.now()); return;
    }
    onChoose(flight);
  }, [byDate, selectedDate, carriers, flightNumber, onChoose]);

  const copy = useCallback(async (flight: FlightSelection | TimetableReference): Promise<void> => {
    const unverified = 'airlineCode' in flight;
    if (unverified && !flightDayView(
      filterDayByFlightNumber(byDate.get(selectedDate), flightNumber), carriers, Date.now(),
    ).references?.some((item) =>
      item.airlineCode === flight.airlineCode && item.flightNumber === flight.flightNumber && item.date === flight.date
      && item.source.checkedAt === flight.source.checkedAt)) {
      setClock(Date.now()); return;
    }
    const notice = unverified
      ? flight.operatorStatus === 'known-other-operator'
        ? t('flights.knownOtherOperatorNotice', { carrier: flight.knownOperatingCarrier ?? '?' })
        : t('flights.referenceNotice')
      : t('flights.publishedNotice');
    const operatorSource = unverified && flight.operatorEvidence ? `\n${flight.operatorEvidence.url}` : '';
    const timing = 'date' in flight
      ? `${flight.date} ${flight.departureTime ?? t('flights.timeUnknown')} → ${flight.arrivalDate ?? t('flights.arrivalDateUnknown')} ${flight.arrivalTime ?? t('flights.timeUnknown')}\n${notice}\n${flight.source.url}${operatorSource}`
      : `${flight.departureLocal.replace('T', ' ')} → ${flight.arrivalLocal.replace('T', ' ')}`;
    const text = `${unverified ? flight.airlineCode : flight.carrier}${flight.flightNumber} | ${from} → ${to}\n${timing}\n${t('flights.localTimes')}\n${t('flights.disclaimer')}`;
    try { await navigator.clipboard.writeText(text); setCopyState('copied'); }
    catch { setCopyState('failed'); }
  }, [byDate, selectedDate, carriers, flightNumber, from, to, t]);

  return (
    <section className="flight-dates" aria-label={`${t('flights.title')} ${from}–${to}`}>
      <div className="flight-dates-head"><h3>{from} → {to} · {t('flights.title')}</h3>
        <button type="button" onClick={onClose}>{t('flights.close')}</button></div>
      {selectedFlightLabel && (
        <div className="flight-dates-selected-flight" data-selected-flight={selectedFlightLabel}>
          <span>{t('flights.selectedFlight')}</span>
          <strong>{selectedFlightLabel}</strong>
          <small>{t('flights.selectedFlightScope', { flight: selectedFlightLabel })}</small>
        </div>
      )}
      <p className="flight-dates-note">{t('flights.disclaimer')}</p>
      <p className="flight-dates-note">{t('flights.scope')}</p>
      {!base && <p className="flight-dates-notice" role="status">{t(hasOfficialPair ? 'flights.publicationOnly' : 'flights.unconfigured')}</p>}
      <div className="flight-dates-month">
        <button type="button" aria-label={t('rtw.schedule.prevMonth')} onClick={() => changeMonth(-1)}>‹</button>
        <strong>{monthLabel}</strong>
        <button type="button" aria-label={t('rtw.schedule.nextMonth')} onClick={() => changeMonth(1)}>›</button>
      </div>
      <button type="button" className="flight-dates-query" disabled={(!base && !hasOfficialPair) || state === 'loading'} onClick={() => void queryMonth()}>
        {t(state === 'loading' ? 'flights.loading' : 'flights.queryMonth')}
      </button>
      {state === 'error' && <p role="alert">{t('flights.queryFailed')}</p>}
      <div className="flight-dates-legend">{(['scheduled', 'published', 'none', 'unknown'] as const).map((status) => (
        <span key={status} data-state={status}>{t(`flights.state.${status}`)} · {[...views.values()].filter((view) => view.status === status).length}</span>
      ))}</div>
      {referenceDates > 0 && <p className="flight-dates-notice">{t('flights.referenceDays', { count: referenceDates })}</p>}
      <div className="flight-dates-grid" aria-busy={state === 'loading'}>
        {Array.from({ length: 7 }, (_, i) => <span key={`weekday-${i}`} className="flight-dates-weekday">{
          new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, i + 1)))
        }</span>)}
        {Array.from({ length: startPadding }, (_, i) => <span key={`pad-${i}`} />)}
        {dates.map((date) => {
          const view = views.get(date)!;
          return <button key={date} type="button" data-flight-date={date} data-state={view.status}
            aria-label={`${date} · ${t(`flights.state.${view.status}`)}${view.references?.length ? ` · ${t('flights.referenceState')}` : ''}`} aria-pressed={selectedDate === date}
            onClick={() => { datePicked.current = true; setSelectedDate(date); setCopyState('idle'); }}>
            <strong>{Number(date.slice(8))}</strong>
            <small>{view.status === 'scheduled' || view.status === 'published' ? t('flights.flightCount', { count: view.flights.length + (view.published?.length ?? 0) })
              : view.references?.length ? t('flights.referenceCount', { count: view.references.length }) : t(`flights.state.${view.status}`)}</small>
          </button>;
        })}
      </div>
      <div className="flight-dates-results">
        <h4>{selectedDate}</h4>
        {current && selectedDay && <p className="flight-dates-note"><a href={current.source.url} target="_blank" rel="noreferrer">{current.source.name}</a>
          {' · '}{t('flights.checkedAt', { time: selectedDay.checkedAt })}</p>}
        {chosen?.status === 'none' && <p>{t('flights.noFlights')}</p>}
        {chosen?.status === 'unknown' && <p role="status">{chosen.references?.length ? t('flights.issue.operator-unverified')
          : current && hasOfficialPair ? t('flights.publicationGap') : t(`flights.issue.${!base ? 'not-configured' : chosen.issue ?? 'not-queried'}`)}</p>}
        {chosen?.issue === 'partial' && chosen.status === 'scheduled' && <p>{t('flights.partial')}</p>}
        {chosen?.flights.map((flight) => <article key={`${flight.carrier}:${flight.flightNumber}:${flight.departureLocal}`} className="flight-dates-flight">
          <strong>{flight.carrier}{flight.flightNumber}</strong>
          <p>{flight.departureLocal.replace('T', ' ')} → {flight.arrivalLocal.replace('T', ' ')}</p>
          <small>{t('flights.localTimes')}</small>
          <div className="flight-dates-actions">
            <button type="button" data-choose-flight={`${flight.carrier}${flight.flightNumber}:${selectedDate}`} onClick={() => choose(flight)}>{t('flights.addDated')}</button>
            <button type="button" onClick={() => void copy(flight)}>{t('flights.copy')}</button>
          </div>
        </article>)}
        {chosen?.published?.map((flight) => <article key={`publication:${flight.carrier}:${flight.flightNumber}:${flight.date}`} className="flight-dates-flight" data-published-flight={`${flight.carrier}${flight.flightNumber}`}>
          <strong>{flight.carrier}{flight.flightNumber} · {t('flights.state.published')}</strong>
          <p>{flight.date} {flight.departureTime ?? t('flights.timeUnknown')} → {flight.arrivalDate ?? t('flights.arrivalDateUnknown')} {flight.arrivalTime ?? t('flights.timeUnknown')}</p>
          <small>{t('flights.publishedNotice')}</small>
          <p className="flight-dates-note"><a href={flight.source.url} target="_blank" rel="noreferrer">{flight.source.name}</a><br />
            {t('flights.sourceReviewed', { date: flight.source.checkedAt.slice(0, 10), until: flight.source.reviewBy.slice(0, 10) })}<br />
            {flight.operatorEvidence && <>{t('flights.operatorVerifiedBy')} <a href={flight.operatorEvidence.url} target="_blank" rel="noreferrer">{flight.operatorEvidence.name}</a><br /></>}
            {flight.effectiveFrom} – {flight.effectiveUntil}</p>
          <div className="flight-dates-actions">
            <button type="button" data-choose-flight={`${flight.carrier}${flight.flightNumber}:${selectedDate}`} onClick={() => choose(flight)}>{t('flights.addDated')}</button>
            <button type="button" onClick={() => void copy(flight)}>{t('flights.copy')}</button>
          </div>
        </article>)}
        {(chosen?.references?.length ?? 0) > 0 && <p className="flight-dates-note">{t('flights.referenceScope')}</p>}
        {chosen?.references?.map((flight) => <article key={`reference:${flight.airlineCode}:${flight.flightNumber}:${flight.date}`}
          className="flight-dates-flight" data-timetable-reference={`${flight.airlineCode}${flight.flightNumber}`}>
          <strong>{flight.airlineCode}{flight.flightNumber} · {t(flight.operatorStatus === 'known-other-operator' ? 'flights.knownOtherOperatorState' : 'flights.referenceState')}</strong>
          <p>{flight.date} {flight.departureTime ?? t('flights.timeUnknown')} → {flight.arrivalDate ?? t('flights.arrivalDateUnknown')} {flight.arrivalTime ?? t('flights.timeUnknown')}</p>
          <small>{flight.operatorStatus === 'known-other-operator'
            ? t('flights.knownOtherOperatorNotice', { carrier: flight.knownOperatingCarrier ?? '?' })
            : t('flights.referenceNotice')}</small>
          <p className="flight-dates-note"><a href={flight.source.url} target="_blank" rel="noreferrer">{flight.source.name}</a><br />
            {t('flights.sourceReviewed', { date: flight.source.checkedAt, until: flight.source.reviewBy })}<br />
            {flight.operatorEvidence && <>{t('flights.operatorIdentifiedBy')} <a href={flight.operatorEvidence.url} target="_blank" rel="noreferrer">{flight.operatorEvidence.name}</a><br /></>}
            {flight.effectiveFrom} – {flight.effectiveUntil}</p>
          <div className="flight-dates-actions">
            <button type="button" onClick={() => void copy(flight)}>{t('flights.referenceCopy')}</button>
          </div>
        </article>)}
        {copyState !== 'idle' && <p role="status">{t(`flights.${copyState}`)}</p>}
      </div>
      {referenceRows.length > 0 && <details className="flight-dates-reference">
        <summary>{t('flights.reference')}</summary>
        <p>{t('flights.referenceWarning')}</p>
        {referenceRows.map((row, i) => <p key={i}>{row.carrier} · {humanizeDays(row.daysOfWeek, locale)} · {row.effectiveFrom ?? '…'} – {row.effectiveUntil ?? '…'}
          {row.sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer"> {new URL(url).hostname}</a>)}
        </p>)}
      </details>}
    </section>
  );
}
