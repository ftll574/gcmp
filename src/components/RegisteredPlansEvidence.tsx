import type { RouteNetworkEntry, RouteNetworkSource } from '../lib/schemas/route-network.ts';

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
  return <details className="registered-plans-evidence">
    <summary>{zh ? '已登記計畫航段' : 'Registered planned legs'} · {plans.length}</summary>
    <p>{zh ? '以下為登記計畫，依 SIROS／SSIM 高信心推論為直飛航段。登記營運者不等於實際已飛行；未確認可訂位或環球票適用。' : 'Registered plans support a high-confidence SIROS/SSIM nonstop-leg inference. The registered operator does not prove actual flights, bookability or RTW fare eligibility.'}</p>
    <p>{zh ? '有效期間含起迄日，星期與出發／到達時間均為 UTC。到達日偏移未知，請勿據此安排接續航班。' : 'Validity includes both endpoints. Weekdays and departure/arrival clocks are UTC. Arrival-day offset is unknown; these clocks cannot establish connections.'}</p>
    <p>{zh ? '重疊期間的不同時間版本各自保留，不能合併為確定班表。共掛欄完整性未知；共掛別名不代表營運者。' : 'Overlapping clock versions remain separate and cannot form a confirmed schedule. Codeshare completeness is unknown; aliases do not establish operators.'}</p>
    {[...new Set(plans.map(p=>p.sourceId))].map(id=>{const source=sourcesById.get(id);return source ? <p key={id}>{zh?'來源核驗日期':'Source review date'}：{source.checkedOn}{id==='anac-siros-skyteam-20261003' ? (zh?'；Creative Commons Attribution 版本未指定，此批未納入已核驗開放資料包。':'; Creative Commons Attribution version unspecified; outside the qualified open-data package.') : ''}</p> : null;})}
    <ul>{plans.map(plan => {
      const source = sourcesById.get(plan.sourceId);
      return <li key={plan.registrationId}>
        <p><strong>{zh ? '登記營運者／班號' : 'Registered operator / flight number'}: {plan.registeredOperator} {plan.flightNumberRaw}</strong></p>
        <p>{plan.effectiveFrom} → {plan.effectiveUntil} · {plan.weekdays.map(day => weekdays[day - 1]).join(', ')} · UTC {plan.departureUTC} → {plan.arrivalUTC}</p>
        {plan.versionConflict ? <p>{zh ? '時間版本衝突，需再確認' : 'Conflicting clock version; recheck required'}</p> : null}
        {source ? <a href={source.url} target="_blank" rel="noreferrer">{zh ? '登記來源' : 'Registration source'} · {plan.registrationId}</a> : <span>{zh ? '來源暫無法顯示' : 'Source unavailable'} · {plan.registrationId}</span>}
      </li>;
    })}</ul>
  </details>;
}
