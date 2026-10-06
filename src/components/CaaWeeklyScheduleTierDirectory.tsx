import { useMemo, useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import { caaScheduleDateState, type CaaWeeklyScheduleAssociation } from '../lib/schemas/caa-weekly-schedule-tier.ts';
import { siteRouteEntityHref } from '../lib/site-navigation.ts';
import { useCaaWeeklyScheduleTier } from '../lib/use-caa-weekly-schedule-tier.ts';
import './CaaWeeklyScheduleTierDirectory.css';

const DAYS = {
  'zh-TW': ['一', '二', '三', '四', '五', '六', '日'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
} as const;

function listedDateStatus(row: CaaWeeklyScheduleAssociation, date: string, zh: boolean): string {
  const state = caaScheduleDateState(row, date);
  if (state === 'listed') return zh ? '來源列示本日' : 'Listed for date';
  if (state === 'not-listed-weekday') return zh ? '本日非列示星期' : 'Weekday not listed';
  if (state === 'conflicting-source-rows') return zh ? '來源時刻衝突，暫不採用' : 'Conflicting source times; withheld';
  if (state === 'outside-published-window') return zh ? '超出有效期間' : 'Outside validity';
  return zh ? '日期無效' : 'Invalid date';
}

export function CaaWeeklyScheduleTierDirectory(): React.ReactElement {
  const { locale } = useLocale();
  const zh = locale === 'zh-TW';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('2026-10-06');
  const [visibleCount, setVisibleCount] = useState(20);
  const state = useCaaWeeklyScheduleTier(open);
  const normalizedQuery = query.trim().toUpperCase();
  const filtered = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data.associations.filter(row => !normalizedQuery || [row.carrier, row.flightDesignator, `${row.from}-${row.to}`, row.from, row.to].some(value => value.includes(normalizedQuery)));
  }, [normalizedQuery, state]);
  const copy = zh ? {
    title: 'CAA 週班表核對參考', summary: '查看班號、方向、星期與來源有效期間',
    explainer: '唯讀旅客規劃參考：488 筆來源列示班號／方向關聯，涵蓋 483 個不同班號與 253 個方向。與營運者已確認班號分層保存。CAA 列示航空公司不等於實際營運者；此資料不會新增航線、獎勵票資格或可選航班，也不確認實際運航、取消、直飛或可訂位。',
    search: '搜尋班號、航空公司或方向', date: '來源日曆參考日（不會選取班次）', listed: '來源列示班次', source: '資料來源', more: '顯示更多', noResults: '沒有符合的來源參考。', loading: '載入 CAA 時刻參考…', failed: 'CAA 時刻參考暫時無法讀取。', retry: '重試', view: '查看方向資料', dataAsOf: '快照日期', notStale: '日期參考依來源有效期間和星期計算。',
  } : {
    title: 'CAA weekly schedule references', summary: 'Browse designators, directions, weekdays and source validity',
    explainer: 'Read-only passenger planning reference: 488 source-listed designator/direction associations, covering 483 distinct designators and 253 directions. Kept separate from operator-confirmed flight numbers. A CAA-listed airline is not necessarily the actual operator. This data adds no route, award eligibility or selectable flight; actual operation, cancellation, nonstop status and bookability are unverified.',
    search: 'Search designator, airline or direction', date: 'Source-calendar reference date (does not select a flight)', listed: 'Source-listed schedule', source: 'Source', more: 'Show more', noResults: 'No source references match this search.', loading: 'Loading CAA timetable references…', failed: 'CAA timetable references are temporarily unavailable.', retry: 'Retry', view: 'View route details', dataAsOf: 'Snapshot date', notStale: 'Date status uses only the source validity period and listed weekday.',
  };
  return (
    <section className="caa-weekly-schedule-directory" data-caa-weekly-schedule-directory>
      <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary><strong>{copy.title}</strong><span>{copy.summary}</span></summary>
        <div className="caa-weekly-schedule-directory__body">
          <p>{copy.explainer}</p>
          {state.status === 'loading' && <p role="status">{copy.loading}</p>}
          {state.status === 'error' && <p role="alert">{copy.failed} <button type="button" onClick={state.retry}>{copy.retry}</button></p>}
          {state.status === 'ready' && <>
            <p>{copy.dataAsOf}: <strong>{state.data.asOfDate}</strong> · {copy.notStale}</p>
            <div className="caa-weekly-schedule-directory__filters">
              <label>{copy.search}<input type="search" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(20); }} /></label>
              <label>{copy.date}<input type="date" value={date} onChange={event => { setDate(event.target.value); setVisibleCount(20); }} /></label>
            </div>
            <p className="caa-weekly-schedule-directory__count">{filtered.length} {zh ? '筆關聯參考' : 'association references'}</p>
            {filtered.length === 0 ? <p>{copy.noResults}</p> : <ul>
              {filtered.slice(0, visibleCount).map(row => {
                const stateText = listedDateStatus(row, date, zh);
                const windows = row.weeklyWindows.map(window => `${window.weekdaysISO.map(day => DAYS[zh ? 'zh-TW' : 'en'][day - 1]).join(' · ')} · ${window.validity.from} → ${window.validity.until} · ${window.departureTimeDisplay} → ${window.arrivalTimeDisplay}`).join(' / ');
                return <li key={row.key} data-caa-weekly-schedule-entry={row.key}>
                  <div><strong>{row.flightDesignator}</strong><span>{row.carrier} · {row.from} → {row.to}</span></div>
                  <p>{windows}</p>
                  <small>{stateText} · {zh ? '營運者未知' : 'operator unknown'} · {zh ? '來源時刻時區未定' : 'source clock timezone unspecified'}</small>
                  <a href={siteRouteEntityHref(`${row.from}-${row.to}`)}>{copy.view} {row.from} → {row.to}</a>
                </li>;
              })}
            </ul>}
            {filtered.length > visibleCount && <button type="button" onClick={() => setVisibleCount(count => count + 20)}>{copy.more}</button>}
            <details className="caa-weekly-schedule-directory__sources">
              <summary>{copy.source}</summary>
              {state.data.sources.map(source => <p key={source.id}>
                {source.attribution} · {source.title} · {source.license} · {source.snapshotSha256}
                {' · '}<a href={source.resourceUrl} target="_blank" rel="noreferrer">{zh ? 'CSV' : 'CSV source'}</a>
                {' · '}<a href={source.hashPageUrl} target="_blank" rel="noreferrer">{zh ? '官方雜湊' : 'Official hash'}</a>
                {' · '}<a href={source.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a>
              </p>)}
            </details>
          </>}
        </div>
      </details>
    </section>
  );
}
