import {OFFICIAL_ROUTE_REFERENCES} from '../lib/official-route-references.ts';
/** Independent route evidence includes nonmembers; no itinerary callbacks or flight controls. */
export function OfficialRouteReferences({pair=null,zh=true}:{readonly pair?:string|null;readonly zh?:boolean}):React.ReactElement|null {
 const rows=OFFICIAL_ROUTE_REFERENCES.filter(r=>pair===null||r.pair.join('-')===pair);
 if(rows.length===0)return null;
 return <section className="data-progress-card" data-official-route-references>
  <h2>{zh?'官方方向與營運者參考（雲端核驗）':'Official direction and operator references (cloud verified)'}</h2>
  <p>{zh?'來源方向參考包含非聯盟會員，不等於實際已飛、可訂位或環球票適用，沒有新增日期航班選取。':'Direction references include nonmembers, without proving actual flights, bookability or RTW eligibility. They add no dated flight-selection controls.'}</p>
  <ul aria-label={zh?'官方方向參考':'Official route references'}>{rows.map(r=><li key={r.key} data-official-route-key={r.key}>
   <p><strong>{r.key}</strong> · Non-stop · {r.carrierIdentityDecision==='operating'?(zh?'來源營運者':'Source operator'):(zh?'來源列示航空公司；實際營運者未知':'Source-listed carrier; actual operator unknown')}：{r.operatorLabel}</p>
   {r.localTimes.length>0 && <p>{r.airportLabels.join(' → ')} · {r.localTimes.join(' → ')} · {r.durationRaw} · {r.aircraftRaw}（{zh?'來源各機場當地時間；未轉成可接續或確定日期班表':'source airport-local clocks; not a connection or confirmed dated schedule'}）</p>}
   <p>{zh?'來源行銷班號':'Source marketing designator'}：{r.marketingDesignators.length?r.marketingDesignators.join(', '):(zh?'未知':'unknown')}（{zh?'僅參考、不可選班':'reference only; non-selectable'}）</p>
   {r.sourceFlights.length>0 && <ul aria-label={zh?'來源日期班號參考':'Source-date flight references'}>{r.sourceFlights.map(f=><li key={f.designator}>{f.designator} · {f.departureRaw} → {f.arrivalRaw} · {r.durationRaw} · {r.aircraftRaw}（{zh?'原文顯示時刻，時區未明列；不可選班':'raw displayed clocks, timezone unstated; non-selectable'}）</li>)}</ul>}
   {r.window.scope==='selected-direction-reference' && <p>{zh?'所選方向顯示窗口':'Selected-direction reference window'}：{r.window.from}～{r.window.until} · {r.window.weekdaysRaw}；{zh?'不是航線首末營運日或庫存保證':'not route launch/cessation dates or inventory'}</p>}
   {r.window.scope==='dated-search-reference' && <p>{zh?'所選單程客運查詢日':'Selected one-way passenger search date'}：{r.window.from}；{r.carrier==='DX'?(zh?'Direkte，單一兩端點；DAT A/S 或 DAT LT 未確認，不擴成每日班表或航線啟航日':'Direkte, single two-endpoint timeline; DAT A/S versus DAT LT unverified. Not a daily schedule or launch date.'):(zh?'Direct 單一航段；10/4 選取已核對標題及詳情，不代表實際已飛或其他日期班表。':'Direct single segment;Oct4 selection verified in heading/details. No actual-flown or other-date schedule claim.')}</p>}
   {r.window.scope==='undated-network-reference' && <p>{zh?'官方當期 direct 航線文字，未限定日期；PSO 本身允許中途停靠，不能單獨作直飛證據。':'Current official direct-route prose is undated. PSO alone permits intermediate stops and cannot prove nonstop.'}</p>}
   {r.window.scope==='seasonal-program-reference' && <p>{r.seasonRaw} · {r.window.weekdaysRaw}；{r.carrier==='PC'?(zh?'旅行季仍有效；售票優惠期限不是服務終止日。原文要求 Pegasus 營運且排除 joint flights，個別日期實際營運者仍未確認。':'Travel season remains valid; sale expiry is not service expiry. Campaign requires Pegasus operation/excludes joint flights; actual dated-flight company unverified.'):(zh?'只保留夏季計畫與獨立編碼參考，不擴為全年服務，確切首末日期未知。':'Summer program plus independent coded reference only; no year-round extension, exact start/end unknown.')}</p>}
   {r.window.scope==='connecting-itinerary-context-only' && <>
    <p>{zh?'連接行程顯示窗口':'Connecting-itinerary display window'}：{r.window.from}～{r.window.until} · {r.window.weekdaysRaw}；{zh?'不是 FI 航段服務日曆，不擴大為全年班次':'not a FI leg service calendar or year-round frequency'}</p>
    <p>{zh?'獨立機場看板另列':'Independent airport board separately lists'} {r.independentBoardDesignators.join(', ')}；{zh?'未建立 EK3359 ↔ FI319 配對，也未把 EK 當營運者。Icelandair 列示全年 OSL，14 班／週僅為夏季高峰。':'no EK3359 ↔ FI319 mapping or EK operating identity. Icelandair lists OSL year-round;14/week is summer peak only.'}</p>
   </>}
   {r.avinorCorroboration.length>0 && <>
    <p><a href="https://www.avinor.no" target="_blank" rel="noreferrer">Flight data from Avinor</a> · NLOD 2.0 · {zh?'已過期的獨立編碼方向參考；沒有 via 不代表直飛，亦不確認營運者':'Expired independent coded direction references; absent via does not prove nonstop or actual operator'}</p>
    <ul aria-label={zh?'Avinor 編碼參考':'Avinor coded references'}>{r.avinorCorroboration.map(f=><li key={`${f.flightId}:${f.scheduledAtUTC}`}>{f.flightId} · UTC {f.scheduledAtUTC}（{zh?'僅候選，不可選班':'candidate only; non-selectable'}）</li>)}</ul>
   </>}
   <p>{zh?'雲端瀏覽器原始選取／展開觀察，本機未重現所選 HTML；觀察日':'Cloud browser selected/expanded primary observation; selected HTML not reproduced locally; observed date'}（UTC）：{r.observedUTCDate}{r.observedUTCMinute?` · ${r.observedUTCMinute}`:''}。</p>
   <details><summary>{zh?'核驗來源':'Evidence sources'}</summary><ul>{r.sourceURLs.map((url,i)=><li key={url}><a href={url} target="_blank" rel="noreferrer">{zh?'官方來源':'Official source'} {i+1}</a></li>)}</ul></details>
  </li>)}</ul>
 </section>;
}
