import {CALI_PRIMARY_REFERENCES} from '../lib/cali-primary-references.ts';
/** Read-only evidence; future selected results never create planner services. */
export function CaliPrimaryReferences({pair=null,zh=true}:{readonly pair?:string|null;readonly zh?:boolean}):React.ReactElement|null {
 const rows=CALI_PRIMARY_REFERENCES.filter(r=>pair===null||r.pair.join('-')===pair);if(!rows.length)return null;
 return <section className="data-progress-card" data-cali-primary-references>
  <h2>{zh?'卡利官方航線參考':'Cali official route references'}</h2>
  <p>{zh?'獨立航空公司來源；未新增可選日期航班、實際已飛或環球票適用保證。':'Independent airline sources; no selectable dated services, actual-flight or RTW eligibility guarantee.'}</p>
  <ul aria-label={zh?'卡利方向參考':'Cali direction references'}>{rows.map(r=><li key={r.key} data-cali-primary-key={r.key}>
   <p><strong>{r.key}</strong> · Non-stop · {r.tier==='current-undated-relationship'?(zh?'目前航線關係，日期未限定':'Current undated relationship'):(zh?'未來訂票樣本；不納入目前航線總數':'Future selected reference; outside current totals')}</p>
   <p>{r.operatorDecision==='provider-listed'?(zh?'法律身分已對應；個別航班營運者未確認':'Legal identity mapped; individual-flight operator unverified'):(zh?'所選結果列明營運者；不代表實際已飛':'Selected result names operator; actual flight unverified')}：{r.operatorLabel}</p>
   {r.tier==='future-selected-reference-only'?<>
    <p>{zh?'單程所選日期':'Selected one-way date'}：{r.selectedDate} · {r.designator} · {r.departureRaw} → {r.arrivalRaw} · {r.durationRaw}（{zh?'來源顯示時刻，時區未明列；僅參考、不可選班':'raw card clocks, timezone unstated; reference only, non-selectable'}）</p>
    <p>{zh?'Directo、單一兩端點客運航段；樣本日期不是開航日、今天營運、全年或每日班次證據或連續季節班表。':'Directo, one two-airport passenger segment; sample date is not launch, current-today, year-round or daily-operation proof or a continuous seasonal calendar.'}</p>
   </>:<p>{r.carrier==='2W'?(zh?'兩個方向各有獨立 sin escalas 文字；WFL 西班牙，不是 WPT 葡萄牙。未驗證班號、季節或頻率。':'Independent sin escalas text for each direction; WFL Spain, not WPT Portugal. Flight numbers, season and frequency unverified.'):(zh?'獨立方向列加當期 direct 文字；保留 EFY／EASYFLY 原始名稱對應，不推定個別營運者。舊頁五月頻率不套用到目前；訂票頁 Cloudflare 已停止，不重試。':'Independent direction rows plus current direct prose; EFY/EASYFLY identity retained without a flight-operator inference. May-only frequency is not a current calendar; blocked booking was stopped.')}</p>}
   <p>{zh?'雲端官方觀察，本機未重現 HTML；觀察日':'Cloud primary observation; HTML not reproduced locally; observed date'}（UTC）：{r.observedUTCDate}{r.observedUTCWindow?` · ${r.observedUTCWindow}`:''}</p>
   <details><summary>{zh?'官方來源':'Official sources'}</summary><ul>{r.sourceURLs.map((url,i)=><li key={url}><a href={url} target="_blank" rel="noreferrer">{zh?'官方來源':'Official source'} {i+1}</a></li>)}</ul></details>
  </li>)}</ul>
 </section>;
}
