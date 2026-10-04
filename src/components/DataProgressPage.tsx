import {CaliPrimaryReferences} from './CaliPrimaryReferences.tsx';
import {OfficialRouteReferences} from './OfficialRouteReferences.tsx';
import { CaaPublishedTimetableDirectory } from './CaaPublishedTimetableDirectory.tsx';
import { useEffect, useState } from 'react';
import { SourceListedFlightPlans } from './SourceListedFlightPlans.tsx';
import { SiteHeader, type SiteView } from './SiteHeader.tsx';
import { siteAssetHref, siteRouteEntityHref } from '../lib/site-navigation.ts';
import { dataProgressSchema, avinorWindowExpired, progressIsStale, type DataProgress } from '../lib/data-progress.ts';
import { SirosRegisteredQueryExplorer } from './SirosRegisteredQueryExplorer.tsx';
import type { SirosRegisteredQueryCatalog } from '../lib/siros-query-catalog.ts';

export function DataProgressPage({ onNavigate }: { readonly onNavigate: (view: SiteView) => void }): React.ReactElement {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<DataProgress | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [localSirosCatalog,setLocalSirosCatalog]=useState<SirosRegisteredQueryCatalog|null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(siteAssetHref('status/data-progress.json'), { cache: 'no-store', signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Unavailable'); return response.json(); })
      .then(raw => { const parsed = dataProgressSchema.parse(raw); if (!controller.signal.aborted) { setData(parsed); setState('ready'); } })
      .catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(()=>{
    if(!import.meta.env.DEV||import.meta.env.MODE==='test')return;
    let cancelled=false;
    void fetch('/__local/siros-registered-query-catalog.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Local SIROS catalog unavailable');return response.json();}).then(raw=>{
      const value=raw as SirosRegisteredQueryCatalog;
      if(value.boundaries?.currentRouteAdmissions===0&&value.boundaries?.selectable===false&&Array.isArray(value.rows)&&!cancelled)setLocalSirosCatalog(value);
    }).catch(()=>{if(!cancelled)setLocalSirosCatalog(null);});
    return ()=>{cancelled=true;};
  },[]);
  const refresh = (): void => { setData(null); setState('loading'); setAttempt(value => value + 1); };
  const bulkProgress=data?.reviews?.sirosBrazilBulk;
  const evidenceStatus=data?.routeEvidenceStatus;
  return <div className="site-page">
    <SiteHeader active="progress" onNavigate={onNavigate} />
    <main id="main-content" className="data-progress-main">
      <h1>資料進度</h1>
      <p>航線資料持續整理中。各資料集的範圍不同，目前沒有可核實的全球完成比例。</p>
      <button className="site-button secondary" onClick={refresh} disabled={state === 'loading'}>重新讀取狀態</button>
      <div role="status" aria-live="polite">
        {state === 'loading' && <p>讀取狀態中…</p>}
        {state === 'error' && <p>目前無法讀取資料狀態，請稍後重試。規劃功能仍使用原有資料。</p>}
      </div>
      {state === 'ready' && data && <>
        <p>狀態產生時間：<time dateTime={data.generatedAt}>{data.generatedAt}</time>。這不是來源更新時間。</p>
        {import.meta.env.DEV&&localSirosCatalog&&<SirosRegisteredQueryExplorer catalog={localSirosCatalog}/>}
        {progressIsStale(data, new Date()) && <p role="status">來源或狀態已超過七天，需重新核對；以下是上次驗證的快照。</p>}
        <section className="data-progress-card" aria-labelledby="legacy-progress">
          <h2 id="legacy-progress">目前網站使用的資料</h2>
          {data.legacy ? <p>航線方向紀錄 {data.legacy.total.toLocaleString()} 筆，其中網站公開 {data.legacy.published.toLocaleString()} 筆。</p> : <p>目前無法驗證這份資料的筆數。</p>}
          <p>這是既有的混合來源資料，包含來源列示與不同程度的營運證據。筆數不代表已完成授權審核或已確認的實際航班。</p>
        </section>
        {evidenceStatus && <section className="data-progress-card" aria-labelledby="route-evidence-status">
          <h2 id="route-evidence-status">現行路線圖與來源證據狀態</h2>
          {evidenceStatus.state==='verified' ? <>
            <p>機場目錄 {evidenceStatus.airports.toLocaleString()} 個；路線圖 {evidenceStatus.runtimeRoutes.toLocaleString()} 個方向紀錄，公開 {evidenceStatus.runtimePublishedRoutes.toLocaleString()} 個。完整執行期 SHA-256：<code>{evidenceStatus.runtimeSHA256}</code></p>
            <p>最近完整驗證：{evidenceStatus.validatedAtUTC}；{evidenceStatus.testFiles} 個測試檔、{evidenceStatus.testSuites} 個測試套件，通過 {evidenceStatus.testsPassed.toLocaleString()} 項。</p>
            <h3>巴西已驗證方向</h3>
            <p>{evidenceStatus.brazil.validatedDirections} 個方向已納入現行路線圖（先前批次 {evidenceStatus.brazil.previousBatchDirections}，REC／CGH 批次 {evidenceStatus.brazil.recentBatchDirections}，GIG 國際批次 {evidenceStatus.brazil.internationalBatchDirections}，通用品牌批次 {evidenceStatus.brazil.genericCarrierBatchDirections}）。REC／CGH 來源看板 {evidenceStatus.brazil.boardRows} 列：精確匹配 {evidenceStatus.brazil.exactBoardRows} 列、保留待查 {evidenceStatus.brazil.heldBoardRows} 列、歧義 {evidenceStatus.brazil.ambiguousBoardRows} 列、未匹配 {evidenceStatus.brazil.unmatchedBoardRows} 列。此層是來源列示的有向證據，不代表已確認實際營運者、航班號或環球票資格。</p>
            <h3>其他來源與缺口</h3>
            <p>阿根廷 Yverá 歷史彙總資料已達研究整理階段：最新資料月 {evidenceStatus.argentina.latestDataMonth}，{evidenceStatus.argentina.rows.toLocaleString()} 列、{evidenceStatus.argentina.rawCarrierPairs} 個原始承運人方向、{evidenceStatus.argentina.icaoAirportPairs} 個 OACI 機場對。資料屬歷史彙總；本機檔案存取待完成，未匯入現行路線圖。</p>
            <ul aria-label="歷史參考試點">{evidenceStatus.historicalReferencePilots.map(item=><li key={item.source}>{item.source}：歷史／參考試點，不證明現行服務；路線匯入 {item.runtimeImports}。</li>)}</ul>
            <ul aria-label="待取得來源">{evidenceStatus.accessPending.map(item=><li key={item.source}>{item.source}：{item.state==='access-needed'?'需要來源存取':'待重新驗證'}{item.lastObservedHttpStatus!==null?`（最近觀察 HTTP ${item.lastObservedHttpStatus}）`:''}。狀態只描述最近觀察，可能隨存取改變。</li>)}</ul>
            <p>下一優先缺口：{evidenceStatus.nextSourceGap.sourceFamily}，需補齊承運人身份映射，再對已快取資料分辨目前、未來與歷史；不需要重做廣泛網路搜尋，也不會單憑登記計畫加入現行路線。</p>
          </> : <p role="status">來源證據摘要未能與目前路線圖及驗證記錄核對，暫不顯示計數。</p>}
        </section>}
        <section className="data-progress-card" aria-labelledby="qualified-progress">
          <h2 id="qualified-progress">獨立開放資料包</h2>
          {data.state === 'verified' && data.qualified ? <>
            <p>固定來源重建與檔案驗證通過。來源擷取日期：<time>{data.qualified.sourceDate}</time>。</p>
            <dl className="data-progress-counts">
              <div><dt>機場基本資料</dt><dd>{data.qualified.airports.toLocaleString()}</dd></div>
              <div><dt>桃園航班看板參考</dt><dd>{data.qualified.board.toLocaleString()}</dd></div>
              <div><dt>歷史端點參考</dt><dd>{data.qualified.historical.toLocaleString()}</dd></div>
              <div><dt>民航局排定端點紀錄</dt><dd>{data.qualified.endpoints.toLocaleString()}</dd></div>
              <div><dt>已確認現行航線</dt><dd>{data.qualified.routes.toLocaleString()}</dd></div>
              <div><dt>已確認航班服務</dt><dd>{data.qualified.services.toLocaleString()}</dd></div>
            </dl>
          </> : <p role="status">{data.state === 'missing' ? '尚未產生開放資料包。' : '開放資料包驗證未通過，暫不顯示成功筆數。'}</p>}
          {data.state === 'verified' && data.qualified?.avinor && <section aria-labelledby="avinor-progress" className="data-progress-card">
            <h3 id="avinor-progress">OSL Avinor 時刻參考</h3>
            <p><a href="https://www.avinor.no" target="_blank" rel="noreferrer">Flight data from Avinor</a> · NLOD 2.0</p>
            <p>原始航班 {data.qualified.avinor.rawFlights} 筆；保存參考 {data.qualified.avinor.references} 筆；待查 {data.qualified.avinor.held} 筆。可放行直飛方向 {data.qualified.avinor.confirmedNonstopDirections}。</p>
            <p>來源擷取：{data.qualified.avinor.capturedAt}。樣本表訂時間範圍（UTC）：{data.qualified.avinor.from}～{data.qualified.avinor.until}。</p>
            {avinorWindowExpired(data, new Date()) && <p role="status">Avinor 樣本時間窗口已結束，僅保留上次擷取參考。</p>}
            <p>這是 OSL 單機場短期滾動時刻快照，並非全季資料。多站、循環端點與共掛別名獨立保留；沒有 via 欄位也不代表已確認直飛。取消不作正向營運證據，亦未確認每筆皆為定期客運。</p>
            <p>網站只讀取本機產生的快照；重新讀取狀態不會向 Avinor 抓取資料。</p>
          </section>}
          <p>參考紀錄可能屬於歷史或未來日期。民航局紀錄須逐筆符合有效期間與星期；看板時間不等於實際起飛時間。上述參考均不保證實際營運航空公司、直飛或可訂位。</p>
          <p>來源：OurAirports（公眾領域）、桃園國際機場與交通部民用航空局（政府資料開放授權條款第 1 版）。這份資料包尚未切換為網站的規劃資料。</p>
        </section>
        {data.reviews?.airportMetadataCollection && <section className="data-progress-card" aria-labelledby="airport-metadata-review">
          <h2 id="airport-metadata-review">OurAirports 機場基本資料補充</h2>
          {data.reviews.airportMetadataCollection.state==='reviewed' ? <>
            <p>使用 {data.reviews.airportMetadataCollection.sourceDate} 固定快照（SHA-256 {data.reviews.airportMetadataCollection.sourceSHA256.slice(0,12)}…）。候選範圍 {data.reviews.airportMetadataCollection.sourceCandidates.toLocaleString()} 個 IATA 機場；其中 scheduled_service=yes 有 {data.reviews.airportMetadataCollection.flaggedYesCandidates.toLocaleString()} 個。</p>
            <p>規劃端機場目錄由 {data.reviews.airportMetadataCollection.appCatalogBefore.toLocaleString()} 增至 {data.reviews.airportMetadataCollection.appCatalogAfter.toLocaleString()} 個，新增 {data.reviews.airportMetadataCollection.admittedMetadataRows.toLocaleString()} 筆小型機場基本資料。flag=yes 對應目錄 {data.reviews.airportMetadataCollection.flaggedYesMappedAfter.toLocaleString()} 個；仍缺 {data.reviews.airportMetadataCollection.remainingFlaggedYesCandidates.toLocaleString()} 個。</p>
            <p>另有 {data.reviews.airportMetadataCollection.heldFlaggedYesOutsideAirportTypeScope.toLocaleString()} 個 flag=yes 的水上飛機基地與直升機場不納入（分別 {data.reviews.airportMetadataCollection.heldSeaplaneBases.toLocaleString()}、{data.reviews.airportMetadataCollection.heldHeliports.toLocaleString()}）。scheduled_service 是來源旗標，不能證明目前定期客運、實際營運或航線；此次新增航線 {data.reviews.airportMetadataCollection.newRouteDirections}。目前航線快照 {data.reviews.airportMetadataCollection.runtimeRoutes.toLocaleString()} 筆，公開 {data.reviews.airportMetadataCollection.runtimePublishedRoutes.toLocaleString()} 筆。</p>
            <p>此為固定來源範圍的基本資料整理，不代表全球覆蓋率或服務完成度。</p>
          </> : <p role="status">機場基本資料補充驗證未通過，暫不顯示成功筆數。</p>}
        </section>}
        {data.reviews && <section className="data-progress-card" aria-labelledby="siros-review">
          <h2 id="siros-review">巴西 SIROS 小樣本研究</h2>
          {data.reviews.siros.state === 'review' ? <>
            <p>已研究：{data.reviews.siros.researchedRows} 筆 OW／Star 條件紀錄，{data.reviews.siros.directionKeys} 個航空公司＋起點＋終點方向；核心核驗 {data.reviews.siros.coreRows} 筆。</p>
            <p>未來缺口 {data.reviews.siros.futureMissing} 個；既有方向補強候選 {data.reviews.siros.existingProofCandidates} 個。新增可規劃直飛：{data.reviews.siros.newSelectable}。</p>
            {data.reviews.siros.plannedDirections && <ul aria-label="未來計畫直飛方向">{data.reviews.siros.plannedDirections.map(direction=><li key={direction.key}>{direction.key}：{direction.effectiveFrom} 至 {direction.effectiveUntil}（UTC；個別登記期間及星期有間隔，非每日連續營運）</li>)}</ul>}
            <p>來源分析日期（UTC）：{data.reviews.siros.sourceDate}。僅讀取排序檔案前 150KB，不能外推全球覆蓋率。</p>
            <p>已登記計畫定期客運航段與登記營運者可辨識；有效起迄日含迄日皆採 UTC。這不等於實際營運、可訂位或環球票票價適用；依 SIROS／SSIM 航段定義，高信心推論為已登記計畫直飛；CSV 並未明列直飛，航段序號也不代表整個航班只有一段。空白共掛欄仍保留未知。</p>
            <p>已研究與可發布分開：此批已保存為獨立計畫證據，未加入公開資料包。來源標示 Creative Commons Attribution，官方未指定版本；本機試接可繼續，公開包法律告知仍待審查。</p>
            <p>各有效期間、星期旗標與期間缺口保留。AA PDF 的時區及分鐘差異未解，沒有覆寫原始值；12 月 DFW 方向仍缺獨立佐證。</p>
            <p>監管附件與 AA PDF 的視覺核驗來自雲端交接；本機只核對已保存 CSV 與官方 SSIM 定義原文，未宣稱取得完整 CSV 欄位對照。</p>
          </> : <p role="status">{data.reviews.siros.state==='missing'?'SIROS 研究資料尚未保存。':'SIROS 研究資料驗證未通過，暫不顯示成功筆數。'}</p>}
        </section>}
        {data.reviews?.sirosSkyteam && <section className="data-progress-card" aria-labelledby="siros-skyteam-review">
          <h2 id="siros-skyteam-review">SIROS SkyTeam 既有方向計畫證據</h2>
          {data.reviews.sirosSkyteam.state==='enriched' ? <>
            <p>{data.reviews.sirosSkyteam.directions.length} 個既有方向補入 {data.reviews.sirosSkyteam.registrations} 筆登記計畫；其中 {data.reviews.sirosSkyteam.currentIntervalRegistrations} 筆期間包含來源分析日。新增 current 方向 {data.reviews.sirosSkyteam.newCurrentDirections}；新增可選航班 {data.reviews.sirosSkyteam.newSelectable}。</p>
            <p>來源分析日（UTC）：{data.reviews.sirosSkyteam.sourceDate}；完整快照擷取：{data.reviews.sirosSkyteam.sourceCapturedAt}。來源 Last-Modified：{data.reviews.sirosSkyteam.sourceLastModified}。建置時間不會刷新來源日期。</p>
            <p>定期客運的已登記計畫航段；有效期間含起迄日，星期與時刻採 UTC。直飛為 SIROS／SSIM 航段語義推論，並非 CSV 明列；到達日偏移未知。登記營運者不代表實際已飛、可訂位或環球票適用。</p>
            <details><summary>24 個已補強方向與各自筆數</summary><ul aria-label="SIROS SkyTeam 已補強方向">{data.reviews.sirosSkyteam.directions.map(d=><li key={d.key}><a href={siteRouteEntityHref(d.key.split(':')[1] ?? '')}>{d.key}</a>：{d.registrations} 筆</li>)}</ul></details>
            <p>以下兩個未來方向維持獨立，不計入 current 航線；期間及星期有間隔，並非每日連續服務：</p>
            <ul aria-label="SIROS SkyTeam 未來方向">{data.reviews.sirosSkyteam.future.map(d=><li key={d.key}>{d.key}：{d.registrations} 筆，{d.from} 至 {d.until}（UTC；不可選航班）</li>)}</ul>
            <p>班號格式待查 {data.reviews.sirosSkyteam.heldRecords} 筆。來源標示 Creative Commons Attribution，版本未指定；此批未納入已核驗開放資料包，公開包告知仍待審查。</p>
          </> : <p role="status">SIROS SkyTeam 證據驗證未通過，暫不顯示成功筆數。</p>}
        </section>}
        {data.reviews?.palSummerInventory && <section className="data-progress-card" aria-labelledby="pal-summer-inventory">
          <h2 id="pal-summer-inventory">Philippine Airlines 2026 夏季表列方向（暫存候選）</h2>
          {data.reviews.palSummerInventory.state==='reviewed' ? <>
            <p><a href="https://www.philippineairlines.com/content/dam/palportal/migration/feature/timetable/260908-Domestic-Summer-Sep-08-2026.pdf" target="_blank" rel="noreferrer">查看 PAL 官方 2026 夏季國內班表</a>（PDF 日期 {data.reviews.palSummerInventory.sourceDate}）。列示窗口 {data.reviews.palSummerInventory.serviceWindow.from} 至 {data.reviews.palSummerInventory.serviceWindow.until}。保存 {data.reviews.palSummerInventory.sourceRows} 個方向列，正規化後 {data.reviews.palSummerInventory.normalizedDirections} 個有序機場方向、{data.reviews.palSummerInventory.bidirectionalPairs} 組雙向機場對，涵蓋 {data.reviews.palSummerInventory.uniqueAirports} 個機場。</p>
            <p>Marketing carrier 為 PR；PR 方向鍵目前 {data.reviews.palSummerInventory.exactPublishedKeys} 個已發布、{data.reviews.palSummerInventory.exactNonPublishedKeys} 個非發布、{data.reviews.palSummerInventory.exactMissingKeys} 個尚無同 carrier 鍵。另有 {data.reviews.palSummerInventory.publishedPhysicalDirectionCoverage} 個方向在圖中由其他 carrier 覆蓋；{data.reviews.palSummerInventory.noPublishedPhysicalDirectionCoverage} 個方向無已發布機場方向覆蓋。</p>
            <p>此 PDF 沒有停靠欄位，82 個方向全部保留為未證明直飛的來源列示候選；每班營運者未確認。Air Philippines 2xxx 班號註腳獨立保留，不套用到 PR 行。航線放行 {data.reviews.palSummerInventory.admittedRoutes}；完整 PDF 未複製到公開頁。</p>
          </> : <p role="status">PAL 候選資料未通過本機方向清單或機場身份核對，暫不顯示摘要。</p>}
        </section>}
        {bulkProgress && <section className="data-progress-card" aria-labelledby="siros-brazil-bulk-review">
          <h2 id="siros-brazil-bulk-review">巴西 SIROS 三家航空公司批次（暫存審查）</h2>
          {bulkProgress.state==='reviewed' ? <>
            <p>原始公司碼映射日 {bulkProgress.mappingVerifiedOn}：TAM→JJ、GLO→G3、AZU→AD。這是登記公司識別，不是 marketing/code-share 通用轉換；TAM/JJ 不等於 LAN/LA 智利。</p>
            <p>快照日（UTC）{bulkProgress.sourceDate}：65,865 筆符合定期客運、運輸對象、SIROS 狀態和日期初篩；65,745 筆端點可唯一映射，120 筆端點待查（未映射 ICAO SBDO 涉72筆）。全批{bulkProgress.directions.toLocaleString()}個登記公司方向鍵、{bulkProgress.distinctAirportPairs.toLocaleString()}個有序機場方向；{bulkProgress.novelDirections.toLocaleString()}個航空公司方向鍵仍缺席於 runtime；{bulkProgress.publishedPhysicalPairOverlapPairs.toLocaleString()}個機場方向已由其他航空公司覆蓋，{bulkProgress.novelPhysicalPairs.toLocaleString()}個目前沒有已發布覆蓋。</p>
            <p>計畫期間涵蓋快照日2,369列，其中 weekday 也列於10月2日2,369列；未來開始63,376列、454個未來專屬方向。這些是登記計畫列，不能推成實際營運、全年／每日班次、可訂位或可規劃日期。另有317筆 Z 前綴班號待查，69組重疊日期／weekday時刻衝突保留核對。</p>
            <details><summary>三家航空公司的暫存量與方向樣本</summary>
              <ul aria-label="SIROS三家承運人暫存統計">{(['JJ','G3','AD'] as const).map(code=>{const c=bulkProgress.byCarrier[code];return <li key={code}>{code}：{c.registeredDirections} 個方向、{c.eligibleRows} 筆日期狀態初篩列、{c.mappedAirportRows} 筆端點可映射、期間重疊 {c.periodRows} 筆、未來開始 {c.futureRows} 筆、班號待查 {c.designatorQuarantineRows} 筆</li>})}</ul>
              <ul aria-label="SIROS未發佈方向樣本">{bulkProgress.examples.map(x=><li key={x.key}>{x.key}（{x.pair}）：{x.registrationRows}筆登記列；{x.futureOnly?'未來開始':'含快照日計畫期間'}；機場方向{x.physicalPairPublishedOverlap?'目前另有航空公司航線':'目前無已發布圖覆蓋'}</li>)}</ul>
            </details>
            <p>來源為本機固定雜湊快取 CSV，無新請求。規劃航段採 SIROS／SSIM 語意推論，CSV沒有明列 nonstop；保留階段序號、原始班號、UTC原始時刻與 codeshare 文字。實際已飛及轉機人權未驗證。版本未指定的 CC Attribution 維持待公開告知審查；此一 bulk SIROS 批次納入公開授權包{bulkProgress.qualifiedPackageImports}、目前航線{bulkProgress.acceptedCurrentRoutes}、可匯入{bulkProgress.readyImports}。REC／CGH 即時看板批次另有獨立三來源證據，不由此 bulk 計畫資料直接放行。</p>
          </> : bulkProgress.state==='stale' ? <p role="status">此批次統計仍固定於舊 runtime（{bulkProgress.reviewRuntimeSHA256}），目前 runtime 為 {bulkProgress.currentRuntimeSHA256}；因路線圖已更新，批次計數尚未對新版本重算。暫不顯示舊計數；來源研究與公開授權審查仍待完成。</p> : <p role="status">SIROS巴西批次未通過快照、carrier mapping 或 runtime 指紋核對，暫不顯示計數。</p>}
        </section>}
        {data.reviews?.avinorSemantics && <section className="data-progress-card" aria-labelledby="avinor-semantics-review">
          <h2 id="avinor-semantics-review">OSL Avinor 客運與停靠語義核驗</h2>
          <p><a href="https://www.avinor.no" target="_blank" rel="noreferrer">Flight data from Avinor</a> · NLOD 2.0</p>
          {data.reviews.avinorSemantics.state==='reviewed' ? <>
            <p>已補強 {data.reviews.avinorSemantics.semanticEnrichedReferences} 筆既有參考的來源語義；新增 current 航線 {data.reviews.avinorSemantics.currentAdditions}，新增可選航班 {data.reviews.avinorSemantics.newSelectable}。</p>
            <p>已保存官方欄位文件確認：此請求的預設範圍包含 J 排定客運與 C 包機客運。每筆屬於定期或包機仍未知，XML 沒有逐筆服務類別；不視為獨立貨運排除或實際營運證明。</p>
            <p>出發方向的 airport 是來源列示到達機場，via_airport 是中途停靠。未保證停靠欄完整或排列順序，沒有 via 不等於直飛；多站及循環目的地不能當第一航段端點或新增反向航線。airline 是來源航空公司代碼，實際執飛公司仍未知。</p>
            <p>比較 {data.reviews.avinorSemantics.directions.length} 個來源方向：{data.reviews.avinorSemantics.matchedDirections} 個已存在，{data.reviews.avinorSemantics.unmatchedDirections} 個未匹配（{data.reviews.avinorSemantics.unmatchedRecords} 筆）；未匹配完整聯盟會員方向 {data.reviews.avinorSemantics.unmatchedMemberDirections}。以上皆非直飛放行。</p>
            <details><summary>查看未匹配方向與原始筆數</summary><ul aria-label="Avinor OSL 未匹配方向">{data.reviews.avinorSemantics.directions.filter(d=>!d.existingPublished).map(d=><li key={d.key}>{d.key}：{d.records} 筆，客運範圍參考／停靠與營運未確認</li>)}</ul></details>
            <ul aria-label="Avinor 中途停靠與循環端點">{data.reviews.avinorSemantics.ambiguousEndpoints.map(r=><li key={r.id}>{r.flightId}：列示目的地 {r.peerAirport}，via {r.viaAirports.join(', ')}；第一航段端點未知</li>)}</ul>
            <p>身份待查 {data.reviews.avinorSemantics.held.length} 筆；共掛 {data.reviews.avinorSemantics.codeshareAliases} 筆只作註記，未展開新方向。所有時刻為 UTC 表訂參考，狀態時間不作實際飛行證明。</p>
            <p>來源擷取 {data.reviews.avinorSemantics.sourceCapturedAt}；表訂窗口 {data.reviews.avinorSemantics.sourceWindow.from}～{data.reviews.avinorSemantics.sourceWindow.until}。這份窗口已結束，僅保留歷史快照；建置時間不刷新來源。此輪來源請求 {data.reviews.avinorSemantics.sourceRequests}，任何後續查詢須在伺服器快取並間隔至少 {data.reviews.avinorSemantics.minimumRefreshSeconds} 秒。</p>
            <p><a href={data.reviews.avinorSemantics.documentation.url} target="_blank" rel="noreferrer">官方欄位文件與使用條款</a>；核驗使用已保存的 {data.reviews.avinorSemantics.sourceDate} 來源，未重試先前被拒的文件網址。原合格資料包未改動。</p>
          </> : <p role="status">Avinor 語義核驗未通過，暫不顯示成功筆數。</p>}
        </section>}
        <OfficialRouteReferences/>
        <CaliPrimaryReferences/>
        <section className="data-progress-card"><h2>接下來整理什麼</h2><p>核對端點紀錄的實際營運航空公司、直飛性質與日期證據，再評估規劃功能需要的其他資料與授權。授權與語意未確認的資料會保留待查。</p></section>
      </>}
      <SourceListedFlightPlans />
      <CaaPublishedTimetableDirectory />
    </main>
  </div>;
}
