import {SOURCE_LISTED_FUTURE_PLANS,listedPlanCalendarLabel} from '../lib/source-listed-flight-plans.ts';
/** Read-only source evidence: no itinerary callbacks or flight-selection controls. */
export function SourceListedFlightPlans():React.ReactElement {
 return <section className="route-evidence-panel" aria-labelledby="source-listed-plans">
  <h2 id="source-listed-plans">來源列示的未來計畫</h2>
  <p>以下保留公告中的方向、日期與班號，尚不可作為可選航班。實際執飛公司及可訂位狀態未確認，不計入目前航線新增。</p>
  <ul aria-label="來源列示未來計畫">{SOURCE_LISTED_FUTURE_PLANS.map(plan=><li key={plan.key}>
   <p><strong>{plan.key}</strong> · 來源列示（source-listed）／不可選航班（non-selectable）</p>
   <p>{listedPlanCalendarLabel(plan.calendar)}</p>
   {plan.flightNumber ? <p>來源列示班號 {plan.flightNumber} · {plan.departureLocal} → {plan.arrivalLocal}（{plan.localTimeLabel}；未轉成確定日期班表）</p>:<p>方向班號未知。</p>}
   <p>{plan.note} 實際執飛公司未知。</p>
   <details><summary>來源與核驗範圍</summary><p>{plan.provenance} 核對日期：{plan.checkedOn}。</p><ul>{plan.sourceURLs.map((url,i)=><li key={url}><a href={url} target="_blank" rel="noreferrer">公告來源 {i+1}</a></li>)}</ul></details>
  </li>)}</ul>
 </section>;
}
