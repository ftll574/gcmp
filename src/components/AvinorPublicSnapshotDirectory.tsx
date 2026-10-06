import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import { parseAvinorXmlPublicSnapshot, type AvinorXmlPublicSnapshot } from '../lib/schemas/avinor-xml-public.ts';
import { useEvidenceClock } from '../lib/use-evidence-clock.ts';
import { siteAssetHref } from '../lib/site-navigation.ts';
import './AvinorPublicSnapshotDirectory.css';

type LoadState = { status: 'idle' | 'loading' | 'error'; data: null } | { status: 'ready'; data: AvinorXmlPublicSnapshot };
const ASSET = 'data/route-network/avinor-osl-public-20261006.json';

export function AvinorPublicSnapshotDirectory(): React.ReactElement {
  const { locale } = useLocale();
  const zh = locale === 'zh-TW';
  const [open, setOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: 'idle', data: null });
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch(siteAssetHref(ASSET), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Avinor snapshot returned HTTP ${response.status}`);
        return parseAvinorXmlPublicSnapshot(await response.json());
      })
      .then(data => { if (!controller.signal.aborted) setState({ status: 'ready', data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error', data: null }); });
    return () => controller.abort();
  }, [open, retryKey]);

  const now = useEvidenceClock(state.status === 'ready' ? [state.data.snapshot.validUntilUTC] : []);
  const expired = state.status === 'ready' && now >= Date.parse(state.data.snapshot.validUntilUTC);
  const dateOutside = state.status === 'ready' && (date < state.data.snapshot.retrievedAtUTC.slice(0, 10) || date > state.data.snapshot.validUntilUTC.slice(0, 10));
  const filtered = useMemo(() => {
    if (state.status !== 'ready') return [];
    const text = query.trim().toUpperCase();
    return state.data.associations.filter(row => {
      const [carrier, , pair, number] = row.candidateKey.split('|');
      const [from, to] = pair?.split('>') ?? [];
      const matchesText = !text || [carrier, number, from, to, `${from}-${to}`].some(value => value?.includes(text));
      const hasDate = row.supportingSourceRows.some(sourceRow =>
        sourceRow.observationClass === 'upcoming-scheduled-row' && sourceRow.scheduleTimeUTC.slice(0, 10) === date,
      );
      return matchesText && hasDate;
    });
  }, [date, query, state]);

  const copy = zh ? {
    title: 'Avinor OSL 六日班表快照', summary: '412 筆有日期的班號／方向比對',
    intro: '單次 Avinor XML Public OSL 快照。Avinor 來源列提供 OperatingAirlineIata、完整 FlightId、方向與 UTC 班表時間；空白 via_airport 只表示來源未列中停機場，不證明實際營運或實體直飛。資料不代表固定班表、獎勵座位或可訂位。',
    scope: '資料範圍', retrieve: '擷取時間（UTC）', expires: '快照有效至（UTC）', stale: '快照已過期；這些班號不再列為目前有效的日期班表證據。', current: '快照仍在有效期限內；每筆日期只表示 Avinor 列有該班表時間，未核對實際運航。',
    search: '搜尋班號、航空公司或方向', dateLabel: '查看來源列示日期（UTC）', count: '符合的班號／方向關聯', noRows: '這個日期沒有符合搜尋條件的來源列。', loading: '載入 Avinor 快照…', failed: 'Avinor 快照暫時無法讀取。', retry: '重試', listed: '來源列示 upcoming schedule', passed: '擷取的班表時間已過；未核對實際運航。', outside: '日期超出快照範圍。', raw: '原始 XML 快照',
    terms: 'Avinor 航班資料條款',
  } : {
    title: 'Avinor OSL six-day schedule snapshot', summary: '412 dated carrier/flight/direction matches',
    intro: 'One Avinor XML Public snapshot for OSL. Avinor lists OperatingAirlineIata, the full FlightId, direction and scheduled UTC time. A blank via_airport means this source reported no intermediate airport; it does not prove actual operation or physical nonstop service. This is not a recurring timetable, award-seat or bookability evidence.',
    scope: 'Snapshot scope', retrieve: 'Retrieved (UTC)', expires: 'Snapshot valid until (UTC)', stale: 'Snapshot expired; these designators are no longer current dated schedule evidence.', current: 'Snapshot is within its validity window. Each date means only that Avinor listed a scheduled occurrence; actual operation was not checked.',
    search: 'Search flight number, airline or direction', dateLabel: 'Show source-listed date (UTC)', count: 'matching flight/direction associations', noRows: 'No source rows match this date and search.', loading: 'Loading Avinor snapshot…', failed: 'The Avinor snapshot is temporarily unavailable.', retry: 'Retry', listed: 'Upcoming schedule listed by source', passed: 'Captured schedule time has passed; actual operation was not checked.', outside: 'Date is outside this snapshot window.', raw: 'Original XML snapshot',
    terms: 'Avinor flight-data terms',
  };

  return (
    <section className="avinor-snapshot-directory" data-avinor-snapshot-directory>
      <details open={open} onToggle={event => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (nextOpen && state.status !== 'ready') setState({ status: 'loading', data: null });
      }}>
        <summary><strong>{copy.title}</strong><span>{copy.summary}</span></summary>
        <div className="avinor-snapshot-directory__body">
          <p>{copy.intro}</p>
          {state.status === 'loading' && <p role="status">{copy.loading}</p>}
          {state.status === 'error' && <p role="alert">{copy.failed} <button type="button" onClick={() => {
            setState({ status: 'loading', data: null });
            setRetryKey(value => value + 1);
          }}>{copy.retry}</button></p>}
          {state.status === 'ready' && <>
            <p className={expired ? 'avinor-snapshot-status expired' : 'avinor-snapshot-status'} role="status">{expired ? copy.stale : copy.current}</p>
            <dl className="avinor-snapshot-meta">
              <dt>{copy.scope}</dt><dd>OSL · TimeFrom=1 · TimeTo=144 hours · one public XML request</dd>
              <dt>{copy.retrieve}</dt><dd>{state.data.snapshot.retrievedAtUTC}</dd>
              <dt>{copy.expires}</dt><dd>{state.data.snapshot.validUntilUTC}</dd>
            </dl>
            <p className="avinor-snapshot-attribution"><a href={state.data.snapshot.attributionURL} target="_blank" rel="noreferrer">Flight data from Avinor</a> · <a href={state.data.snapshot.termsURL} target="_blank" rel="noreferrer">{copy.terms}</a> · <a href={siteAssetHref(`data/${state.data.snapshot.rawResponsePath}`)}>{copy.raw}</a> · SHA-256 {state.data.snapshot.responseSHA256}</p>
            <div className="avinor-snapshot-filters">
              <label>{copy.search}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
              <label>{copy.dateLabel}<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
            </div>
            <p className="avinor-snapshot-count">{filtered.length} {copy.count}</p>
            {dateOutside ? <p>{copy.outside}</p> : filtered.length === 0 ? <p>{copy.noRows}</p> : <ul>
              {filtered.slice(0, 80).map(row => {
                const [carrier, , pair, number] = row.candidateKey.split('|');
                const [from, to] = pair?.split('>') ?? [];
                const sourceRows = row.supportingSourceRows.filter(sourceRow => sourceRow.observationClass === 'upcoming-scheduled-row' && sourceRow.scheduleTimeUTC.slice(0, 10) === date);
                const times = [...new Set(sourceRows.map(sourceRow => sourceRow.scheduleTimeUTC))].sort();
                const passed = times.length > 0 && times.every(value => Date.parse(value) <= now);
                const status = expired ? copy.stale : passed ? copy.passed : copy.listed;
                return <li key={row.candidateKey} data-avinor-association={row.candidateKey}>
                  <div><strong>{number}</strong><span>{carrier} · {from} → {to}</span></div>
                  <p>{times.map(value => value.replace('T', ' ').replace('Z', ' UTC')).join(' · ') || copy.outside}</p>
                  <small>{status} · {zh ? '僅來源班表資料' : 'published schedule only'}</small>
                </li>;
              })}
            </ul>}
            {filtered.length > 80 && <p>{zh ? '顯示前 80 筆；可用搜尋縮小結果。' : 'Showing the first 80 rows; use search to narrow the results.'}</p>}
          </>}
        </div>
      </details>
    </section>
  );
}
