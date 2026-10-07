import type { RouteNetworkEntry, RouteNetworkSource } from '../lib/schemas/route-network.ts';
import { siteAssetHref } from '../lib/site-navigation.ts';

interface Props {
  readonly plans: NonNullable<RouteNetworkEntry['registeredPlans']>;
  readonly sources: ReadonlyArray<RouteNetworkSource>;
  readonly zh: boolean;
}
const weekdaysZh = ['一', '二', '三', '四', '五', '六', '日'];
const weekdaysEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Registration evidence stays read-only and separate from selectable flight numbers. */
export function RegisteredPlansEvidence({ plans, sources, zh }: Props): React.ReactElement | null {
  if (plans.length === 0) return null;
  const sourcesById = new Map(sources.map(source => [source.id, source]));
  const weekdays = zh ? weekdaysZh : weekdaysEn;
  const evidenceSourceIds = [...new Set(plans.flatMap(plan => [plan.sourceId, ...(plan.sourceRowLineage ?? []).map(row => row.sourceId)]))].sort();
  return <details className="registered-plans-evidence">
    <summary>{zh ? '已登記計畫航段' : 'Registered planned legs'} · {plans.length}</summary>
    <p>{zh ? '以下為官方來源列出的登記班表證據；登記不代表航班已實際運行，也不代表可訂位或適用環球票。' : 'These are registered-schedule records listed by the cited sources. Registration does not prove actual operation, bookability or RTW fare eligibility.'}</p>
    <p>{zh ? '有效期間含起迄日，星期與出發／到達時間均為 UTC。到達日偏移未知，請勿據此安排接續航班。' : 'Validity includes both endpoints. Weekdays and departure/arrival clocks are UTC. Arrival-day offset is unknown; these clocks cannot establish connections.'}</p>
    <p>{zh ? '重疊期間的不同時間版本各自保留。共掛欄保留來源原文；共掛別名不代表營運者。' : 'Overlapping clock versions remain separate. Raw codeshare text is retained; a marketing alias does not establish the operator.'}</p>
    {evidenceSourceIds.map(id => {
      const source = sourcesById.get(id);
      if (!source) return null;
      return <p key={id}>
        {zh ? '來源' : 'Source'}: <a href={source.url} target="_blank" rel="noreferrer">{source.id}</a> · {source.checkedOn}
        {source.retrievedAtUTC ? ` · ${zh ? '擷取' : 'retrieved'} ${source.retrievedAtUTC}` : ''}
        {source.contentSHA256 ? <> · SHA-256 <code>{source.contentSHA256}</code></> : null}
        {source.attribution ? <><br />{source.attribution}</> : null}
        {source.rawAssetPath ? <><br /><a href={siteAssetHref(`data/${source.rawAssetPath}`)}>{zh ? '已接受 SIROS 原始資料列封存' : 'Accepted raw SIROS source rows'}</a></> : null}
      </p>;
    })}
    <ul>{plans.map(plan => {
      const planKey = JSON.stringify([plan.registrationId, plan.flightNumberRaw, plan.effectiveFrom, plan.effectiveUntil, plan.weekdays, plan.departureUTC, plan.arrivalUTC, plan.stageNumber ?? null]);
      return <li key={planKey}>
        <p><strong>{zh ? '登記營運者／原始班號' : 'Registered operator / raw flight number'}: {plan.registeredOperator} <code>{plan.flightNumberRaw}</code></strong></p>
        {plan.registeredOperatorICAO ? <p>{zh ? '來源 ICAO 營運者代碼' : 'Source operator ICAO'}: <code>{plan.registeredOperatorICAO}</code>{plan.carrierEntityKey ? <> · {zh ? '航空公司實體' : 'Carrier entity'}: <code>{plan.carrierEntityKey}</code></> : null}</p> : null}
        <p>{plan.effectiveFrom} → {plan.effectiveUntil} · {plan.weekdays.map(day => weekdays[day - 1]).join(', ')} · UTC {plan.departureUTC} → {plan.arrivalUTC}</p>
        {plan.stageNumber !== undefined ? <p>{zh ? '登記階段' : 'Registered stage'}: {plan.stageNumber}</p> : null}
        {plan.versionConflict ? <p>{zh ? '時間版本衝突，需再確認' : 'Conflicting clock version; recheck required'}</p> : null}
        {plan.codeshareRaw ? <p>{zh ? '共掛欄（來源原文）' : 'Codeshare field (raw source text)'}: <code>{plan.codeshareRaw}</code></p> : null}
        <p>{zh ? '登記編號' : 'Registration ID'}: <code>{plan.registrationId}</code></p>
        {(plan.sourceRowLineage ?? []).map(row => <p key={`${row.sourceId}:${row.sourceRow}`}>
          {zh ? 'SIROS 來源資料列' : 'SIROS source row'} {row.sourceRow} · {zh ? '列 SHA-256' : 'row SHA-256'} <code>{row.sourceRowSHA256}</code>
        </p>)}
      </li>;
    })}</ul>
  </details>;
}
