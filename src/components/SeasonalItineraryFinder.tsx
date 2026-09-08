import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import { findSeasonalItinerary, type SeasonalItineraryResult } from '../lib/rtw/seasonal-itinerary.ts';
import { SeasonalRtwTemplateSchema, type SeasonalRtwTemplate } from '../lib/schemas/rtw-seasonal.ts';
import './SeasonalItineraryFinder.css';

interface Props {
  readonly productId: string;
  readonly templateUrl: string;
  readonly initialStartDate?: string | undefined;
  readonly onApply: (result: Extract<SeasonalItineraryResult, { ok: true }>, template: SeasonalRtwTemplate) => void;
  /** Test/embed shortcut. Production callers leave this undefined and keep the
   * seasonal catalog lazy-loaded from a static data URL. */
  readonly templateOverride?: SeasonalRtwTemplate | undefined;
}

const copy = {
  'zh-TW': {
    summary: '經典路線 · 自動找可飛日期',
    summaryHint: '用已核實的季節班表，找一組能一路接完的航班',
    intro: '目前先提供 EVA 官方 Star Alliance 環球範例。這裡只驗班表可行，不代表有哩程票位。',
    start: '希望從哪一天開始',
    find: '找一組班表可行日期',
    loading: '載入季節班表…',
    loadFailed: '季節班表載入失敗，請稍後再試。',
    found: '找到一組可排的班表',
    requested: '希望出發',
    actual: '實際首段',
    end: '最後抵達',
    apply: '套用並取代目前行程',
    disclaimer: '班表可行 ≠ 哩程票有位；請再向航空公司確認 award inventory、稅費與開票規則。',
    noFlight: '在目前已核實的季節班表範圍內，無法把整張票接完。',
    failedAt: '卡在第 {n} 段，最早嘗試日期 {date}。',
    invalid: '請輸入有效且位於可搜尋範圍內的日期。',
    source: '資料來源',
  },
  en: {
    summary: 'Classic route · find scheduled dates',
    summaryHint: 'Use verified seasonal schedules to find one end-to-end flight plan',
    intro: 'Currently available for EVA’s official Star Alliance RTW example. This proves schedule feasibility only, not award-seat availability.',
    start: 'Preferred starting date',
    find: 'Find a schedulable itinerary',
    loading: 'Loading seasonal schedules…',
    loadFailed: 'Seasonal schedule data could not be loaded. Please try again.',
    found: 'Schedulable itinerary found',
    requested: 'Requested start',
    actual: 'Actual first flight',
    end: 'Final arrival',
    apply: 'Apply and replace current itinerary',
    disclaimer: 'Scheduled ≠ award seat available. Confirm award inventory, taxes and ticketing rules with the airline.',
    noFlight: 'The full itinerary cannot fit inside the currently verified seasonal schedule window.',
    failedAt: 'Blocked at segment {n}; earliest attempted date {date}.',
    invalid: 'Enter a valid date inside the supported search window.',
    source: 'Sources',
  },
} as const;

export function SeasonalItineraryFinder({
  productId,
  templateUrl,
  initialStartDate,
  onApply,
  templateOverride,
}: Props): React.ReactElement | null {
  const { locale } = useLocale();
  const c = locale === 'zh-TW' ? copy['zh-TW'] : copy.en;
  const [open, setOpen] = useState(false);
  const [remoteTemplate, setRemoteTemplate] = useState<SeasonalRtwTemplate | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'ready' | 'error'>(
    templateOverride ? 'ready' : 'idle',
  );
  const loadingRef = useRef(false);
  const template = templateOverride ?? remoteTemplate;
  const [startDate, setStartDate] = useState(initialStartDate ?? '2026-11-02');
  const [result, setResult] = useState<SeasonalItineraryResult | null>(null);

  useEffect(() => {
    if (!open || templateOverride || remoteTemplate || loadState !== 'idle' || loadingRef.current) return;
    loadingRef.current = true;
    void fetch(templateUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return SeasonalRtwTemplateSchema.parse(await response.json());
      })
      .then((parsed) => { setRemoteTemplate(parsed); setLoadState('ready'); })
      .catch(() => setLoadState('error'))
      .finally(() => { loadingRef.current = false; });
  }, [open, templateOverride, remoteTemplate, loadState, templateUrl]);

  const visible = templateOverride?.productId === productId
    || remoteTemplate?.productId === productId
    || (!template && productId === 'br-infinity-star-alliance-world-travel-award');
  const sourceMap = useMemo(() => new Map(template?.sources.map((source) => [source.id, source]) ?? []), [template]);
  if (!visible) return null;

  function run(): void {
    if (!template) return;
    setResult(findSeasonalItinerary(template, startDate));
  }

  return (
    <details
      className="seasonal-itinerary-finder"
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (nextOpen && loadState === 'error') setLoadState('idle');
      }}
      data-seasonal-finder={productId}
    >
      <summary>
        <span><strong>{c.summary}</strong><small>{c.summaryHint}</small></span>
      </summary>
      <div className="seasonal-itinerary-body">
        <p>{c.intro}</p>
        {open && !template && loadState === 'idle' && <p role="status">{c.loading}</p>}
        {loadState === 'error' && <p role="alert">{c.loadFailed}</p>}
        {template && (
          <>
            <label className="seasonal-itinerary-start">
              <span>{c.start}</span>
              <input
                type="date"
                min={template.searchStart}
                max={template.searchEnd}
                value={startDate}
                onChange={(event) => { setStartDate(event.target.value); setResult(null); }}
              />
            </label>
            <button type="button" className="seasonal-itinerary-find" onClick={run}>{c.find}</button>
            <small className="seasonal-itinerary-window">{template.searchStart} – {template.searchEnd}</small>
          </>
        )}
        {result?.ok && template && (
          <section className="seasonal-itinerary-result" aria-label={c.found}>
            <header>
              <strong>{c.found}</strong>
              <span>{c.requested} {result.requestedStartDate} · {c.actual} {result.actualStartDate} · {c.end} {result.endDate}</span>
            </header>
            <ol>
              {result.flights.map((flight) => (
                <li key={`${flight.patternId}:${flight.date}`} data-seasonal-flight={`${flight.carrier}${flight.flightNumber}:${flight.date}`}>
                  <time>{flight.date}</time>
                  <strong>{flight.carrier}{flight.flightNumber}</strong>
                  <span>{flight.from} → {flight.to}</span>
                  <small>{flight.departureTime} → {flight.arrivalTime}{flight.arrivalDate !== flight.date ? ` · ${flight.arrivalDate}` : ''}</small>
                  <details>
                    <summary>{c.source}</summary>
                    {flight.sourceIds.map((id) => {
                      const source = sourceMap.get(id);
                      return source ? <a key={id} href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : null;
                    })}
                  </details>
                </li>
              ))}
            </ol>
            <p className="seasonal-itinerary-warning">{c.disclaimer}</p>
            <button type="button" className="seasonal-itinerary-apply" onClick={() => onApply(result, template)}>{c.apply}</button>
          </section>
        )}
        {result && !result.ok && (
          <div className="seasonal-itinerary-failure" role="status">
            <strong>{result.reason === 'no-flight' ? c.noFlight : c.invalid}</strong>
            {result.reason === 'no-flight' && result.failedSegmentIndex !== undefined && result.earliestDate && (
              <span>{c.failedAt.replace('{n}', String(result.failedSegmentIndex + 1)).replace('{date}', result.earliestDate)}</span>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
