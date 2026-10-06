import { useMemo, useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import { caaScheduleWindowDateState, type CaaScheduleDateState, type CaaWeeklyScheduleTier, type CaaWeeklyScheduleWindow } from '../lib/schemas/caa-weekly-schedule-tier.ts';
import { useCaaWeeklyScheduleTier } from '../lib/use-caa-weekly-schedule-tier.ts';

const DAYS = {
  'zh-TW': ['週一', '週二', '週三', '週四', '週五', '週六', '週日'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
} as const;

function dateStateLabel(state: CaaScheduleDateState, zh: boolean): string {
  if (state === 'listed') return zh ? '來源列示本日期／星期' : 'Listed for this source date and weekday';
  if (state === 'not-listed-weekday') return zh ? '有效期間內，但來源未列此星期' : 'Within validity, but this weekday is not listed';
  if (state === 'conflicting-source-rows') return zh ? '來源日期／星期有時刻衝突，暫不列為核對班表' : 'Conflicting source times; withheld from verified schedule status';
  if (state === 'outside-published-window') return zh ? '不在來源有效期間' : 'Outside the published validity period';
  return zh ? '日期格式無效' : 'Invalid date';
}

function dateStateClass(state: CaaScheduleDateState): string {
  return state === 'listed' ? 'is-listed' : 'is-not-listed';
}

function ScheduleWindow({
  window,
  tier,
  date,
  zh,
}: {
  readonly window: CaaWeeklyScheduleWindow;
  readonly tier: CaaWeeklyScheduleTier;
  readonly date: string;
  readonly zh: boolean;
}): React.ReactElement {
  const source = tier.sources.find(item => item.id === window.sourceId)!;
  const state = dateStateLabel(caaScheduleWindowDateState(window, date), zh);
  const weekdays = window.weekdaysISO.map(day => DAYS[zh ? 'zh-TW' : 'en'][day - 1]).join(' · ');
  return (
    <li className="caa-weekly-schedule-window" data-caa-schedule-window={`${window.sourceId}:${window.validity.from}:${window.weekdayMaskRaw}:${window.departureTimeRaw}`}>
      <p><strong>{weekdays}</strong> · {window.validity.from} → {window.validity.until}</p>
      <p className={`caa-weekly-schedule-date-state ${dateStateClass(caaScheduleWindowDateState(window, date))}`}>{state}</p>
      <p>
        {zh ? 'CAA 原始時刻（時區未定）' : 'CAA source clocks (timezone not defined)'}: {window.departureTimeDisplay} → {window.arrivalTimeDisplay}
        {window.arrivalDayOffset === null
          ? (zh ? ' · 到達日偏移未定' : ' · arrival-day offset unknown')
          : ` · ${zh ? '僅來源明印到達日偏移' : 'source explicitly marks arrival-day offset'} +${window.arrivalDayOffset}`}
      </p>
      {window.codeshareInfoRaw && <p>{zh ? 'CAA 共掛欄原文（未展開成其他航班）' : 'CAA codeshare field (not expanded into extra flights)'}: {window.codeshareInfoRaw}</p>}
      {window.reportedTransitAirports.length > 0
        ? <p>{zh ? '來源列示中停欄位' : 'Source-listed transit fields'}: {window.reportedTransitAirports.join(' · ')} · {zh ? '端點不代表直飛' : 'endpoints do not establish nonstop service'}</p>
        : <p>{zh ? '來源未回報中停欄；直飛未確認。' : 'No transit was reported in these fields; nonstop service is unconfirmed.'}</p>}
      <details>
        <summary>{zh ? '來源、授權與原始列' : 'Source, license and original rows'}</summary>
        <p>{source.attribution} · {source.title} · {source.datasetId} · {source.license}</p>
        <p>{zh ? '資料擷取時間' : 'Retrieved'}: {source.retrievedAt} · {zh ? '原始 CSV 列' : 'CSV rows'}: {window.sourceLineNumbers.join(', ')}</p>
        <p>SHA-256: <code>{source.snapshotSha256}</code></p>
        <p>
          <a href={source.resourceUrl} target="_blank" rel="noreferrer">{zh ? '原始 CSV' : 'Original CSV'}</a>
          {' · '}<a href={source.datasetUrl} target="_blank" rel="noreferrer">{zh ? '開放資料集' : 'Open data dataset'}</a>
          {' · '}<a href={source.hashPageUrl} target="_blank" rel="noreferrer">{zh ? '官方雜湊頁' : 'Official hash page'}</a>
          {' · '}<a href={source.licenseUrl} target="_blank" rel="noreferrer">OGDL-Taiwan-1.0</a>
        </p>
      </details>
    </li>
  );
}

/** Route-detail reference only; it has no callback into the planner's flight selector. */
export function CaaWeeklyScheduleRouteEvidence({ from, to }: { readonly from: string; readonly to: string }): React.ReactElement | null {
  const { locale } = useLocale();
  const zh = locale === 'zh-TW';
  const state = useCaaWeeklyScheduleTier(true);
  const [date, setDate] = useState('2026-10-06');
  const associations = useMemo(
    () => state.status === 'ready' ? state.data.associations.filter(item => item.from === from && item.to === to) : [],
    [state, from, to],
  );

  if (state.status === 'loading') return <p className="caa-weekly-schedule-loading" role="status">{zh ? '讀取 CAA 週班表參考…' : 'Loading CAA weekly schedule references…'}</p>;
  if (state.status === 'error') return <p className="caa-weekly-schedule-error" role="status">{zh ? 'CAA 週班表參考暫無法讀取。' : 'CAA weekly schedule references are temporarily unavailable.'}</p>;
  if (associations.length === 0) return null;

  return (
    <section className="caa-weekly-schedule-route" data-caa-weekly-schedule-route={`${from}-${to}`}>
      <h3>{zh ? 'CAA 已核對週班表參考' : 'CAA verified weekly schedule references'} · {from} → {to}</h3>
      <p>{zh
        ? `此方向有 ${associations.length} 筆來源班號／週班表關聯。這是 2026-10-06 的來源快照；列示航空公司不等於實際營運者。參考日期只比對來源日期、星期和有效期間，不會選取班次或改動行程。`
        : `${associations.length} source-listed designator/weekly-schedule associations are recorded for this direction. Snapshot as of 2026-10-06. A listed airline is not a verified operating carrier. The reference date checks only the source dates, weekdays and validity window; it does not select a flight or change your itinerary.`}</p>
      <p>{zh
        ? '來源時刻的時區未定；未確認實際運航、取消、直飛、可訂位或獎勵票適用。此層不會進入營運者已確認班號或獎勵行程資格。'
        : 'Source clock time zones are unspecified. Actual operation, cancellation, nonstop status, bookability and award eligibility are unverified. This tier is separate from operator-confirmed designators and award-route eligibility.'}</p>
      <label className="caa-weekly-schedule-date">
        {zh ? '來源日曆參考日（非選班）' : 'Source-calendar reference date (not flight selection)'}
        <input type="date" data-caa-weekly-schedule-date value={date} onChange={event => setDate(event.target.value)} />
      </label>
      <ul>
        {associations.map(association => (
          <li className="caa-weekly-schedule-association" data-caa-schedule-association={association.key} key={association.key}>
            <h4>{association.flightDesignator} <small>{zh ? '來源列示；營運者未知' : 'listed by source; operator unknown'}</small></h4>
            <ul>{association.weeklyWindows.map(window => <ScheduleWindow key={`${window.sourceId}:${window.validity.from}:${window.weekdayMaskRaw}:${window.departureTimeRaw}`} window={window} tier={state.data} date={date} zh={zh} />)}</ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
