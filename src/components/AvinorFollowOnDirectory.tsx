import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import {
  parseAvinorFollowOnLedgerJsonl,
  parseAvinorFollowOnRelease,
  type AvinorFollowOnLedgerRow,
  type AvinorFollowOnRelease,
} from '../lib/schemas/avinor-follow-on.ts';
import { useEvidenceClock } from '../lib/use-evidence-clock.ts';
import { siteAssetHref } from '../lib/site-navigation.ts';
import './AvinorPublicSnapshotDirectory.css';

type LoadState =
  | { readonly status: 'idle' | 'loading' | 'error'; readonly release: null; readonly rows: null }
  | { readonly status: 'ready'; readonly release: AvinorFollowOnRelease; readonly rows: ReadonlyArray<AvinorFollowOnLedgerRow> };

interface Props {
  readonly onPlanRoute: (route: { from: string; to: string; carrier: string; flightNumber: string; departsOn: string }) => void;
}

const RELEASE_ASSET = 'data/route-network/avinor-follow-on-release-20261006.json';
const LEDGER_ASSET = 'data/route-network/avinor-follow-on-evidence-20261006.jsonl';

function publicRawAssetPath(airport: string): string {
  return airport === 'OSL'
    ? 'route-network/avinor-osl-public-20261006.xml'
    : `route-network/avinor-xml-public-${airport.toLowerCase()}-20261006.xml`;
}

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

export function AvinorFollowOnDirectory({ onPlanRoute }: Props): React.ReactElement {
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
        if (!response.ok) throw new Error(`Avinor follow-on release returned HTTP ${response.status}`);
        return parseAvinorFollowOnRelease(await response.json());
      }),
      fetch(siteAssetHref(LEDGER_ASSET), { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`Avinor follow-on evidence returned HTTP ${response.status}`);
        return response.text();
      }),
    ]).then(async ([release, ledger]) => {
      const expected = release.assets.acceptedLedger;
      if (new TextEncoder().encode(ledger).byteLength !== expected.bytes || await sha256Text(ledger) !== expected.sha256) {
        throw new Error('Avinor follow-on evidence failed its release size/hash check');
      }
      const rows = parseAvinorFollowOnLedgerJsonl(ledger);
      if (rows.length !== release.accepted.identityGroups
        || rows.reduce((total, row) => total + row.occurrences.length, 0) !== release.accepted.occurrences) {
        throw new Error('Avinor follow-on evidence totals do not match its release manifest');
      }
      if (!controller.signal.aborted) setState({ status: 'ready', release, rows });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: 'error', release: null, rows: null });
    });
    return () => controller.abort();
  }, [open, retryKey]);

  const deadlines = state.status === 'ready'
    ? state.rows.flatMap((row) => row.occurrences.flatMap((occurrence) => {
        const source = state.release.sourceSnapshots.find((snapshot) => snapshot.airport === occurrence.sourceAirport);
        return source ? [source.freshUntilUTC, occurrence.expiresAtUTC] : [occurrence.expiresAtUTC];
      }))
    : [];
  const now = useEvidenceClock(deadlines);
  const queryUpper = query.trim().toUpperCase();
  const filtered = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.rows.flatMap((row) => row.occurrences.flatMap((occurrence) => {
      const sourceDate = dateInOslo(occurrence.scheduleTimeUTC);
      if (sourceDate !== date) return [];
      const [from, to] = row.candidateKey.split('|')[2]?.split('>') ?? [];
      const searchable = [
        row.identity.carrierCode, row.identity.carrierEntityName ?? '', row.identity.flightDesignator,
        from ?? '', to ?? '', `${from}-${to}`, occurrence.sourceAirport, occurrence.sourceUniqueID,
        occurrence.scheduleTimeUTC, occurrence.statusCode, occurrence.arrDepRaw,
      ].join(' ').toUpperCase();
      return !queryUpper || searchable.includes(queryUpper) ? [{ row, occurrence, sourceDate }] : [];
    }));
  }, [date, queryUpper, state]);

  const copy = zh ? {
    title: 'Avinor 跟進日期班表', summary: '1,172 個淨新增身份 · 1,373 個已接受身份 · 11 個機場快照',
    intro: '此跟進資料整合 11 個 Avinor 公開 XML 快照。每筆只保留來源列示的營運航空公司代碼、完整班號、方向和預定 UTC 時間；空白 via 僅代表來源未列中停機場，不證明實際運航或實體直飛，也不代表固定班表、獎勵座位或可訂位。每筆到預定時間即到期。',
    scope: '涵蓋範圍', search: '搜尋班號、代碼、方向或機場', date: '來源列示日期（Europe/Oslo）', count: '個日期班表列', noRows: '此日期沒有符合搜尋條件的來源班表列。',
    loading: '載入並驗證 Avinor 跟進資料…', failed: 'Avinor 跟進資料暫時無法讀取或驗證。', retry: '重試', schedule: '來源列示預定時間', passed: '預定時間已過；未核對實際運航。', expired: '該班表時間已到；此 occurrence 已到期。', upcoming: '未到預定時間；僅為來源列示班表。', stale: '來源快照已過期。',
    unresolved: '顯示名稱未解析；保留來源代碼', departure: '來源列示出發', arrival: '來源列示抵達', source: '來源機場', raw: '原始 XML', plan: '將此來源列示出發加入 Planner',
    window: '此 occurrence 超出舊候選期間；保留舊期間作歷史脈絡', attribution: 'Flight data from Avinor', terms: 'Avinor flight-data terms', directness: '來源方向與日期班表身份；未核實中停或實體直飛。', snapshots: '原始來源快照與 SHA-256', retrieved: '擷取時間', rawSnapshot: '原始 XML', hash: 'SHA-256',
  } : {
    title: 'Avinor follow-on schedule evidence', summary: '1,172 net-new identities · 1,373 accepted total · 11 airport snapshots',
    intro: 'This follow-on release combines 11 public Avinor XML snapshots. Each occurrence preserves the source-listed operating-carrier code, full flight ID, direction and scheduled UTC time. A blank via field means the source listed no intermediate airport; it does not prove actual operation or physical nonstop service, and it does not establish a recurring timetable, award seats or bookability. Each occurrence expires at its scheduled time.',
    scope: 'Coverage', search: 'Search flight number, code, direction or airport', date: 'Source-listed date (Europe/Oslo)', count: 'dated schedule rows', noRows: 'No source schedule rows match this date and search.',
    loading: 'Loading and verifying Avinor follow-on evidence…', failed: 'Avinor follow-on evidence could not be loaded or verified.', retry: 'Retry', schedule: 'Source-listed scheduled time', passed: 'Scheduled time has passed; actual operation was not checked.', expired: 'Scheduled time reached; this occurrence is expired.', upcoming: 'Before scheduled time; source-listed schedule only.', stale: 'Source snapshot has expired.',
    unresolved: 'Display name unresolved; source code retained', departure: 'Source-listed departure', arrival: 'Source-listed arrival', source: 'Source airport', raw: 'Original XML', plan: 'Add this source-listed departure to Planner',
    window: 'Occurrence falls outside its old candidate window; the old window is retained as historical context', attribution: 'Flight data from Avinor', terms: 'Avinor flight-data terms', directness: 'Source-listed direction and dated schedule identity; intermediate stops and physical nonstop service are unverified.', snapshots: 'Original source snapshots and SHA-256', retrieved: 'Retrieved', rawSnapshot: 'Original XML', hash: 'SHA-256',
  };

  return (
    <section className="avinor-snapshot-directory avinor-follow-on-directory" data-avinor-follow-on-directory>
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
            <p className="avinor-snapshot-meta">{copy.scope}: {state.release.coverage.documentedAirportCount} airports · {state.release.accepted.identityGroups} identities · {state.release.accepted.occurrences} occurrences · {state.release.accepted.directedAirportPairs} directed airport pairs · {state.release.accepted.carrierDirectedRoutes} carrier-directed routes</p>
            <p className="avinor-snapshot-attribution"><a href={new URL(state.release.licenseAndAttribution.requiredVisibleAttribution.href).href} target="_blank" rel="noreferrer">{copy.attribution}</a> · <a href={state.release.licenseAndAttribution.termsUrl} target="_blank" rel="noreferrer">{copy.terms}</a></p>
            <details className="avinor-follow-on-source-snapshots">
              <summary>{copy.snapshots} · {state.release.sourceSnapshots.length}</summary>
              <ul>
                {state.release.sourceSnapshots.map((snapshot) => <li key={snapshot.airport}>
                  <strong>{snapshot.airport}</strong> · {copy.retrieved} {snapshot.retrievedAtUTC} · HTTP {snapshot.httpStatus} · {snapshot.responseBytes.toLocaleString()} bytes · {copy.hash} <code>{snapshot.responseSHA256}</code> · <a href={siteAssetHref(`data/${snapshot.rawAssetPath}`)}>{copy.rawSnapshot}</a>
                </li>)}
              </ul>
            </details>
            <div className="avinor-snapshot-filters">
              <label>{copy.search}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <label>{copy.date}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            </div>
            <p className="avinor-snapshot-count">{filtered.length} {copy.count}</p>
            {filtered.length === 0 ? <p>{copy.noRows}</p> : <ul>
              {filtered.slice(0, 60).map(({ row, occurrence, sourceDate }) => {
                const [from = '', to = ''] = row.identity.origin && row.identity.destination
                  ? [row.identity.origin, row.identity.destination]
                  : ['', ''];
                const snapshot = state.release.sourceSnapshots.find((item) => item.airport === occurrence.sourceAirport);
                const sourceFreshUntil = snapshot?.freshUntilUTC ?? '';
                const expired = now >= Date.parse(occurrence.expiresAtUTC);
                const staleSnapshot = !snapshot || now >= Date.parse(sourceFreshUntil);
                const departure = occurrence.arrDepRaw === 'D' && occurrence.sourceAirport === row.identity.origin;
                const currentDatedOccurrence = !staleSnapshot && !expired && now < Date.parse(occurrence.scheduleTimeUTC);
                return <li key={`${row.candidateKey}:${occurrence.sourceAirport}:${occurrence.sourceRow}:${occurrence.sourceUniqueID}`} data-avinor-follow-on-identity={row.candidateKey}>
                  <div><strong><code>{row.identity.flightDesignator}</code></strong><span>{row.identity.carrierCode} · {from} → {to}</span></div>
                  <p><time dateTime={occurrence.scheduleTimeUTC}>{copy.schedule}: {occurrence.scheduleTimeUTC.replace('T', ' ').replace('Z', ' UTC')}</time> · {sourceDate}</p>
                  <p>{copy.source}: {occurrence.sourceAirport} · {departure ? copy.departure : copy.arrival} · OperatingAirlineIata {occurrence.sourceOperatingCarrierIATA} · direction {occurrence.arrDepRaw || '—'} · status {occurrence.statusCode || '—'} · via {occurrence.viaAirportRaw || '—'}</p>
                  {row.identity.carrierEntityNameMapping !== 'unique-trusted-name'
                    ? <small>{copy.unresolved} · {row.identity.carrierCode}</small>
                    : row.identity.carrierEntityName && <small>{row.identity.carrierEntityName} · {row.identity.carrierCode}</small>}
                  {occurrence.oldCandidateWindowConflict && <small role="status">{copy.window} ({row.oldCandidateWindow.effectiveFrom ?? '—'} → {row.oldCandidateWindow.effectiveUntil ?? '—'}; {row.oldCandidateWindowConflictOccurrenceCount} conflicting occurrences)</small>}
                  <small>{staleSnapshot ? copy.stale : expired ? copy.expired : currentDatedOccurrence ? copy.upcoming : copy.passed} · {copy.directness} · expires {occurrence.expiresAtUTC}</small>
                  {snapshot && <a href={siteAssetHref(`data/${publicRawAssetPath(snapshot.airport)}`)}>{copy.raw}: {occurrence.sourceAirport}</a>}
                  {currentDatedOccurrence && departure && <button type="button" aria-label={`${copy.plan}: ${row.identity.flightDesignator} · ${sourceDate}`} onClick={() => onPlanRoute({
                    from, to, carrier: row.identity.carrierCode,
                    flightNumber: row.identity.flightDesignator.slice(row.identity.carrierCode.length), departsOn: sourceDate!,
                  })}>{copy.plan} · {sourceDate}</button>}
                </li>;
              })}
            </ul>}
            {filtered.length > 60 && <p>{zh ? '顯示前 60 筆；可用搜尋縮小結果。' : 'Showing the first 60 rows; use search to narrow results.'}</p>}
          </>}
        </div>
      </details>
    </section>
  );
}
