import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import {
  parseAvinorRemainingAirportsLedgerJsonl,
  parseAvinorRemainingAirportsRelease,
  type AvinorRemainingAirportsLedgerRow,
  type AvinorRemainingAirportsRelease,
} from '../lib/schemas/avinor-remaining-airports.ts';
import { siteAssetHref } from '../lib/site-navigation.ts';
import { useEvidenceClock } from '../lib/use-evidence-clock.ts';
import './AvinorPublicSnapshotDirectory.css';

type LoadState =
  | { readonly status: 'idle' | 'loading' | 'error'; readonly release: null; readonly rows: null }
  | { readonly status: 'ready'; readonly release: AvinorRemainingAirportsRelease; readonly rows: ReadonlyArray<AvinorRemainingAirportsLedgerRow> };

interface Props {
  readonly onPlanRoute: (route: { from: string; to: string; carrier: string; flightNumber: string; departsOn: string }) => void;
}

const RELEASE_ASSET = 'data/route-network/avinor-remaining-airports-release-20261007.json';
const LEDGER_ASSET = 'data/route-network/avinor-remaining-airports-accepted-20261007.jsonl';

async function sha256Text(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Browser SHA-256 is unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function dateInOslo(timestamp: string): string | null {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(parsed));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : null;
}

function osloToday(): string {
  return dateInOslo(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10);
}

export function AvinorRemainingAirportsDirectory({ onPlanRoute }: Props): React.ReactElement {
  const { locale } = useLocale();
  const zh = locale === 'zh-TW';
  const [open, setOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: 'idle', release: null, rows: null });
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(osloToday);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void Promise.all([
      fetch(siteAssetHref(RELEASE_ASSET), { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`Avinor remaining-airports release returned HTTP ${response.status}`);
        return parseAvinorRemainingAirportsRelease(await response.json());
      }),
      fetch(siteAssetHref(LEDGER_ASSET), { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`Avinor remaining-airports ledger returned HTTP ${response.status}`);
        return response.text();
      }),
    ]).then(async ([release, ledger]) => {
      if (new TextEncoder().encode(ledger).byteLength !== release.acceptedInput.bytes
        || await sha256Text(ledger) !== release.acceptedInput.sha256) {
        throw new Error('Avinor remaining-airports ledger failed its release size/hash check');
      }
      const rows = parseAvinorRemainingAirportsLedgerJsonl(ledger);
      if (rows.length !== release.accepted.identityGroups
        || rows.reduce((total, row) => total + row.occurrenceEvidence.length, 0) !== release.accepted.occurrences) {
        throw new Error('Avinor remaining-airports ledger totals do not match its release manifest');
      }
      if (!controller.signal.aborted) setState({ status: 'ready', release, rows });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: 'error', release: null, rows: null });
    });
    return () => controller.abort();
  }, [open, retryKey]);

  const deadlines = state.status === 'ready'
    ? state.rows.flatMap((row) => row.occurrenceEvidence.flatMap((occurrence) => {
        const source = state.release.sourceSnapshots.find((snapshot) => snapshot.airport === occurrence.sourceAirport);
        return source ? [source.freshUntilUTC, occurrence.expiresAtUTC] : [occurrence.expiresAtUTC];
      }))
    : [];
  const now = useEvidenceClock(deadlines);
  const queryUpper = query.trim().toUpperCase();
  const allOccurrences = useMemo(() => state.status === 'ready'
    ? state.rows.flatMap((row) => row.occurrenceEvidence.map((occurrence) => ({ row, occurrence })))
    : [], [state]);
  const currentOccurrences = state.status === 'ready' ? allOccurrences.filter(({ occurrence }) => {
    const source = state.release.sourceSnapshots.find((snapshot) => snapshot.airport === occurrence.sourceAirport);
    return source && now < Date.parse(source.freshUntilUTC)
      && now < Date.parse(occurrence.expiresAtUTC)
      && now < Date.parse(occurrence.scheduleTimeUTC);
  }) : [];
  const currentIdentityCount = new Set(currentOccurrences.map(({ row }) => row.candidateKey)).size;
  const currentRouteCount = new Set(currentOccurrences.map(({ row }) => `${row.candidate.carrierCode}|${row.candidate.carrierEntityKey}|${row.candidate.origin}>${row.candidate.destination}`)).size;
  const filtered = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.rows.flatMap((row) => row.occurrenceEvidence.flatMap((occurrence) => {
      const sourceDate = dateInOslo(occurrence.scheduleTimeUTC);
      if (sourceDate !== date) return [];
      const searchable = [
        row.candidate.carrierCode, row.candidate.carrierEntityName ?? '', row.candidate.flightDesignator,
        row.candidate.origin, row.candidate.destination, `${row.candidate.origin}-${row.candidate.destination}`,
        occurrence.sourceAirport, occurrence.sourceUniqueID, occurrence.scheduleTimeUTC, occurrence.statusCode,
        occurrence.arrDepRaw, occurrence.viaAirportRaw,
      ].join(' ').toUpperCase();
      return !queryUpper || searchable.includes(queryUpper) ? [{ row, occurrence, sourceDate }] : [];
    }));
  }, [date, queryUpper, state]);

  const copy = zh ? {
    title: 'Avinor 其餘機場日期班表', summary: '143 個新身份 · 517 筆班表列 · 24 個來源快照',
    intro: '這批獨立審核資料保留來源列示的營運航空公司代碼、完整班號、方向、來源列和預定 UTC 時間。via 欄位空白表示來源未列中停機場；這不代表已核實實體直飛或實際運航，也不證明固定服務、獎勵座位或可訂位；每筆 occurrence 在預定時間到期。',
    scope: '本批資料', search: '搜尋班號、代碼、方向或機場', date: '來源列示日期（Europe/Oslo）', count: '筆日期班表列', noRows: '此日期沒有符合搜尋條件的來源班表列。',
    loading: '載入並驗證 Avinor 資料…', failed: 'Avinor 資料暫時無法讀取或驗證。', retry: '重試', schedule: '來源列示預定時間', expired: '班表時間已到；此 occurrence 已到期。', upcoming: '未到預定時間；僅為來源列示班表。', stale: '來源快照已過期。',
    unresolved: '顯示名稱未解析；保留來源代碼', departure: '來源列示出發', arrival: '來源列示抵達', source: '來源機場', raw: '原始 XML', plan: '將此來源列示出發加入 Planner',
    attribution: 'Flight data from Avinor', terms: 'Avinor flight-data terms', snapshots: '原始來源快照與 SHA-256', retrieved: '擷取時間', hash: 'SHA-256',
    current: '目前可用班表列', identities: '目前可用身份', routes: '目前可用承運航空公司方向', directness: '來源列示日期方向；中停或實體直飛未核實。',
  } : {
    title: 'Avinor remaining-airports schedule evidence', summary: '143 new identities · 517 schedule rows · 24 source snapshots',
    intro: 'This independently reviewed batch preserves the source-listed operating-carrier code, full flight ID, direction, source row and scheduled UTC time. A blank via field means the source reported no intermediate airport; it does not prove physical nonstop service or actual operation, recurring service, award seats or bookability. Each occurrence expires at its scheduled time.',
    scope: 'Release scope', search: 'Search flight number, code, direction or airport', date: 'Source-listed date (Europe/Oslo)', count: 'dated schedule rows', noRows: 'No source schedule rows match this date and search.',
    loading: 'Loading and verifying Avinor evidence…', failed: 'Avinor evidence could not be loaded or verified.', retry: 'Retry', schedule: 'Source-listed scheduled time', expired: 'Scheduled time reached; this occurrence is expired.', upcoming: 'Before scheduled time; source-listed schedule only.', stale: 'Source snapshot has expired.',
    unresolved: 'Display name unresolved; source code retained', departure: 'Source-listed departure', arrival: 'Source-listed arrival', source: 'Source airport', raw: 'Original XML', plan: 'Add this source-listed departure to Planner',
    attribution: 'Flight data from Avinor', terms: 'Avinor flight-data terms', snapshots: 'Original source snapshots and SHA-256', retrieved: 'Retrieved', hash: 'SHA-256',
    current: 'currently eligible schedule rows', identities: 'currently eligible identities', routes: 'currently eligible carrier directions', directness: 'Source-listed direction and dated schedule identity; intermediate stops and physical nonstop service are unverified.',
  };

  return (
    <section className="avinor-snapshot-directory avinor-follow-on-directory" data-avinor-remaining-directory>
      <details open={open} onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (nextOpen && state.status !== 'ready') setState({ status: 'loading', release: null, rows: null });
      }}>
        <summary><strong>{copy.title}</strong><span>{copy.summary}</span></summary>
        <div className="avinor-snapshot-directory__body">
          <p>{copy.intro}</p>
          {state.status === 'loading' && <p role="status">{copy.loading}</p>}
          {state.status === 'error' && <p role="alert">{copy.failed} <button type="button" onClick={() => {
            setState({ status: 'loading', release: null, rows: null });
            setRetryKey((value) => value + 1);
          }}>{copy.retry}</button></p>}
          {state.status === 'ready' && <>
            <p className="avinor-snapshot-meta">
              {copy.scope}: {state.release.coverage.remainingAirportScopeCount} airports · {state.release.accepted.identityGroups} identities · {state.release.accepted.occurrences} occurrences · {state.release.accepted.directedEndpointPairs} directed airport pairs · {state.release.accepted.carrierDirectedRoutes} carrier-directed routes · {state.release.sourceSnapshots.length} contributing snapshots
            </p>
            <p className="avinor-snapshot-meta">
              {currentOccurrences.length.toLocaleString()} {copy.current} · {currentIdentityCount.toLocaleString()} {copy.identities} · {currentRouteCount.toLocaleString()} {copy.routes}
            </p>
            <p className="avinor-snapshot-attribution"><a href={state.release.licenseAndAttribution.requiredVisibleAttribution.href} target="_blank" rel="noreferrer">{copy.attribution}</a> · <a href={state.release.licenseAndAttribution.termsURL} target="_blank" rel="noreferrer">{copy.terms}</a></p>
            <details className="avinor-follow-on-source-snapshots">
              <summary>{copy.snapshots} · {state.release.sourceSnapshots.length}</summary>
              <ul>{state.release.sourceSnapshots.map((snapshot) => <li key={snapshot.airport}>
                <strong>{snapshot.airport}</strong> · {copy.retrieved} {snapshot.retrievedAtUTC} · HTTP {snapshot.httpStatus} · {snapshot.responseBytes.toLocaleString()} bytes · {copy.hash} <code>{snapshot.responseSHA256}</code> · <a href={siteAssetHref(`data/${snapshot.rawAssetPath}`)}>{copy.raw}</a>
              </li>)}</ul>
            </details>
            <div className="avinor-snapshot-filters">
              <label>{copy.search}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <label>{copy.date}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            </div>
            <p className="avinor-snapshot-count">{filtered.length} {copy.count}</p>
            {filtered.length === 0 ? <p>{copy.noRows}</p> : <ul>{filtered.slice(0, 60).map(({ row, occurrence, sourceDate }) => {
              const { origin: from, destination: to, carrierCode, carrierEntityName, carrierEntityNameMapping, flightDesignator } = row.candidate;
              const source = state.release.sourceSnapshots.find((snapshot) => snapshot.airport === occurrence.sourceAirport);
              const stale = !source || now >= Date.parse(source.freshUntilUTC);
              const expired = now >= Date.parse(occurrence.expiresAtUTC);
              const departure = occurrence.arrDepRaw === 'D' && occurrence.sourceAirport === from;
              const eligible = !stale && !expired && now < Date.parse(occurrence.scheduleTimeUTC);
              return <li key={`${row.candidateKey}:${occurrence.sourceAirport}:${occurrence.sourceRow}:${occurrence.sourceUniqueID}`} data-avinor-remaining-identity={row.candidateKey}>
                <div><strong><code>{flightDesignator}</code></strong><span>{carrierCode} · {from} → {to}</span></div>
                <p><time dateTime={occurrence.scheduleTimeUTC}>{copy.schedule}: {occurrence.scheduleTimeUTC.replace('T', ' ').replace('Z', ' UTC')}</time> · {sourceDate}</p>
                <p>{copy.source}: {occurrence.sourceAirport} · {departure ? copy.departure : copy.arrival} · OperatingAirlineIata {occurrence.operatingCarrierIATA} · direction {occurrence.arrDepRaw || '—'} · status {occurrence.statusCode || '—'} · via {occurrence.viaAirportRaw || '—'} · row {occurrence.sourceRow} · ID {occurrence.sourceUniqueID}</p>
                {carrierEntityNameMapping === 'unique-trusted-name' && carrierEntityName
                  ? <small>{carrierEntityName} · {carrierCode}</small>
                  : <small>{copy.unresolved} · {carrierCode}</small>}
                <small>{stale ? copy.stale : expired ? copy.expired : copy.upcoming} · {copy.directness} · expires {occurrence.expiresAtUTC}</small>
                {source && <a href={siteAssetHref(`data/${source.rawAssetPath}`)}>{copy.raw}: {occurrence.sourceAirport}</a>}
                {eligible && departure && <button type="button" aria-label={`${copy.plan}: ${flightDesignator} · ${sourceDate}`} onClick={() => onPlanRoute({
                  from, to, carrier: carrierCode, flightNumber: flightDesignator.slice(carrierCode.length), departsOn: sourceDate!,
                })}>{copy.plan} · {sourceDate}</button>}
              </li>;
            })}</ul>}
            {filtered.length > 60 && <p>{zh ? '顯示前 60 筆；可用搜尋縮小結果。' : 'Showing the first 60 rows; use search to narrow results.'}</p>}
          </>}
        </div>
      </details>
    </section>
  );
}
