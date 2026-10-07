import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import { parseAvinorXmlPublicBatch, type AvinorXmlPublicBatch } from '../lib/schemas/avinor-xml-public-batch.ts';
import { useEvidenceClock } from '../lib/use-evidence-clock.ts';
import { siteAssetHref } from '../lib/site-navigation.ts';
import './AvinorPublicBatchDirectory.css';

type LoadState = { status: 'idle' | 'loading' | 'error'; data: null } | { status: 'ready'; data: AvinorXmlPublicBatch };
const ASSET = 'data/route-network/avinor-public-airport-batch-20261006.json';

export function AvinorPublicBatchDirectory(): React.ReactElement {
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
        if (!response.ok) throw new Error(`Avinor airport batch returned HTTP ${response.status}`);
        return parseAvinorXmlPublicBatch(await response.json());
      })
      .then(data => { if (!controller.signal.aborted) setState({ status: 'ready', data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error', data: null }); });
    return () => controller.abort();
  }, [open, retryKey]);

  const now = useEvidenceClock(state.status === 'ready' ? state.data.snapshots.map(snapshot => snapshot.validUntilUTC) : []);
  const filtered = useMemo(() => {
    if (state.status !== 'ready') return [];
    const text = query.trim().toUpperCase();
    return state.data.associations.flatMap(association => {
      const candidate = association.candidate;
      const matchesText = !text || [candidate.carrierCode, candidate.flightDesignator, candidate.origin,
        candidate.destination, `${candidate.origin}-${candidate.destination}`, ...association.airportSnapshots].some(value => value.includes(text));
      if (!matchesText) return [];
      const rows = association.supportingRows.filter(row => row.observationClass === 'upcoming-scheduled-row' && row.scheduleTimeUTC.slice(0, 10) === date);
      return rows.length > 0 ? [{ association, rows }] : [];
    });
  }, [date, query, state]);

  const copy = zh ? {
    title: 'Avinor XML Public 多機場六日快照', summary: '201 筆精確營運航空公司／班號／方向關聯',
    intro: '這是 2026-10-06 的十次限量 XML Public 機場快照（BGO、TRD、SVG、TOS、BOO、KRS、AES、MOL、EVE、BDU），每次僅查詢 TimeFrom=1、TimeTo=144 小時，兩個方向。班表列不表示固定營運、實際運航、獎勵座位或可訂位。',
    attribution: 'Avinor 資料條款要求在資料附近顯示連結署名。', terms: 'Avinor 航班資料條款',
    requestScope: '每份來源快照', retrieve: '擷取（UTC）', expires: '快照有效至（UTC）', fresh: '快照仍在六日有效範圍內。', stale: '快照已過期；其日期列不再算目前有效的來源班表證據。',
    search: '搜尋班號、航空公司、方向或機場', dateLabel: '來源列示日期（UTC）', count: '符合的班號／方向關聯', noRows: '這個日期沒有符合的 upcoming 班表列。',
    loading: '載入 Avinor 多機場快照…', failed: 'Avinor 快照暫時無法讀取。', retry: '重試', listed: '來源列示班表時間', passed: '來源列示時間已過；未核對實際運航。',
    outside: '日期超出這批快照的 UTC 範圍。', raw: '原始 XML', accepted: '個接受關聯', empty: '此機場快照沒有此批接受關聯。',
    groups: '接受資料包', candidateWindow: '既有候選有效期間至', candidateAfter: '此班表列超出既有候選有效期間；快照不延長該期間。', candidateUnknown: '擷取時既有候選有效期間未知；快照不推定有效期間。',
    readOnly: '僅供檢視的來源班表證據；Planner 操作已停用。',
  } : {
    title: 'Avinor XML Public multi-airport six-day snapshots', summary: '201 exact operating-carrier/flight/direction matches',
    intro: 'Ten bounded XML Public airport snapshots retrieved on 2026-10-06 (BGO, TRD, SVG, TOS, BOO, KRS, AES, MOL, EVE and BDU). Each used TimeFrom=1 and TimeTo=144 hours, both directions. Listed schedules do not establish recurring service, actual operation, award seats or bookability.',
    attribution: 'Avinor terms require visible linked attribution near the data.', terms: 'Avinor flight-data terms',
    requestScope: 'Source snapshot', retrieve: 'Retrieved (UTC)', expires: 'Snapshot valid until (UTC)', fresh: 'Snapshot is inside its six-day validity window.', stale: 'Snapshot expired; its dated rows are no longer current source schedule evidence.',
    search: 'Search flight, airline, direction or airport', dateLabel: 'Source-listed date (UTC)', count: 'matching flight/direction associations', noRows: 'No upcoming schedule rows match this date.',
    loading: 'Loading Avinor multi-airport snapshots…', failed: 'The Avinor snapshots are temporarily unavailable.', retry: 'Retry', listed: 'Schedule time listed by source', passed: 'Source-listed time passed; actual operation was not checked.',
    outside: 'Date is outside this batch’s UTC snapshot range.', raw: 'Original XML', accepted: 'accepted associations', empty: 'No accepted association from this batch for this airport.',
    groups: 'Accepted input packets', candidateWindow: 'Existing candidate validity through', candidateAfter: 'This listed occurrence is beyond the existing candidate window; the snapshot does not extend it.', candidateUnknown: 'The existing candidate window was unknown at capture; the snapshot does not infer one.',
    readOnly: 'Read-only source schedule evidence; Planner actions are disabled.',
  };

  const dateOutside = state.status === 'ready' && (date < '2026-10-06' || date > '2026-10-12');
  return (
    <section className="avinor-batch-directory" data-avinor-batch-directory>
      <details open={open} onToggle={event => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (nextOpen && state.status !== 'ready') setState({ status: 'loading', data: null });
      }}>
        <summary><strong>{copy.title}</strong><span>{copy.summary}</span></summary>
        <div className="avinor-batch-directory__body">
          <p>{copy.intro}</p>
          <p className="avinor-batch-attribution"><a href="https://www.avinor.no/" target="_blank" rel="noreferrer">Flight data from Avinor</a> · <a href="https://partner.avinor.no/en/services/flight-data/" target="_blank" rel="noreferrer">{copy.terms}</a>. {copy.attribution}</p>
          {state.status === 'loading' && <p role="status">{copy.loading}</p>}
          {state.status === 'error' && <p role="alert">{copy.failed} <button type="button" onClick={() => {
            setState({ status: 'loading', data: null });
            setRetryKey(value => value + 1);
          }}>{copy.retry}</button></p>}
          {state.status === 'ready' && <>
            <dl className="avinor-batch-meta">
              <dt>{copy.groups}</dt><dd>{state.data.acceptedInputPackets.map(packet => `${packet.associationCount} · SHA-256 ${packet.sha256}`).join(' | ')}</dd>
              <dt>{copy.requestScope}</dt><dd>TimeFrom=1 · TimeTo=144 hours · codeshare=Y · both directions</dd>
            </dl>
            <section className="avinor-batch-snapshots" aria-label={copy.requestScope}>
              {state.data.snapshots.map(snapshot => {
                const expired = now >= Date.parse(snapshot.validUntilUTC);
                return <article key={snapshot.airport} className={expired ? 'expired' : ''}>
                  <h4>{snapshot.airport} <small>{expired ? copy.stale : copy.fresh}</small></h4>
                  <dl>
                    <dt>{copy.retrieve}</dt><dd>{snapshot.retrievedAtUTC}</dd>
                    <dt>{copy.expires}</dt><dd>{snapshot.validUntilUTC}</dd>
                    <dt>{copy.accepted}</dt><dd>{snapshot.acceptedAssociationCount || copy.empty}</dd>
                  </dl>
                  <p><a href={siteAssetHref(`data/${snapshot.rawResponsePath}`)}>{copy.raw} · {snapshot.responseBytes.toLocaleString()} bytes · SHA-256 {snapshot.responseSHA256}</a></p>
                </article>;
              })}
            </section>
            <div className="avinor-batch-filters">
              <label>{copy.search}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
              <label>{copy.dateLabel}<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
            </div>
            <p className="avinor-batch-count">{filtered.length} {copy.count}</p>
            {dateOutside ? <p>{copy.outside}</p> : filtered.length === 0 ? <p>{copy.noRows}</p> : <ul className="avinor-batch-associations">
              {filtered.slice(0, 80).map(({ association, rows }) => {
                const candidate = association.candidate;
                const notExpired = rows.some(row => {
                  const snapshot = state.data.snapshots.find(item => item.airport === row.sourceAirport);
                  return snapshot && now < Date.parse(snapshot.validUntilUTC);
                });
                const allPassed = rows.every(row => Date.parse(row.scheduleTimeUTC) <= now);
                const extendsCandidateWindow = candidate.effectiveUntil !== undefined && rows.some(row => row.scheduleTimeUTC.slice(0, 10) > candidate.effectiveUntil!);
                return <li key={association.candidateKey} data-avinor-batch-association={association.candidateKey}>
                  <div><strong>{candidate.flightDesignator}</strong><span>{candidate.carrierCode} · {candidate.origin} → {candidate.destination}</span></div>
                  <p>{[...new Set(rows.map(row => row.scheduleTimeUTC))].sort().map(value => value.replace('T', ' ').replace('Z', ' UTC')).join(' · ')}</p>
                  <small>{notExpired ? allPassed ? copy.passed : copy.listed : copy.stale} · {copy.readOnly}</small>
                  <small>{candidate.effectiveUntil ? `${copy.candidateWindow} ${candidate.effectiveUntil}${extendsCandidateWindow ? ` · ${copy.candidateAfter}` : ''}` : copy.candidateUnknown}</small>
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
