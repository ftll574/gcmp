import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, cleanup, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

it('publishes validated runtime, Brazil evidence, source tiers and current access gaps without a global completion claim',async()=>{
 const evidence={state:'verified',asOf:'2026-10-03',validatedAtUTC:'2026-10-04T02:04:45Z',testFiles:160,testSuites:305,testsPassed:1693,testsFailed:0,airports:5353,runtimeRoutes:31650,runtimePublishedRoutes:31060,runtimeSHA256:'6f8ba5b0abc36d9d8eab7b051fd77321a9c83f41fca94091f27c2eca067f189d',brazil:{previousBatchDirections:51,recentBatchDirections:127,internationalBatchDirections:18,genericCarrierBatchDirections:8,validatedDirections:204,boardRows:578,exactBoardRows:506,heldBoardRows:59,ambiguousBoardRows:6,unmatchedBoardRows:7,evidenceTier:'provider-listed-directed',actualOperatingCarrierConfirmed:false,flightNumbersAdded:false,roundTheWorldEligibilityEstablished:false},argentina:{source:'Argentina Yverá Conectividad Aérea',state:'research-ready',tier:'historical-aggregate',latestDataMonth:'2026-07',rows:1078289,rawCarrierPairs:688,icaoAirportPairs:426,localFixtureState:'access-needed',runtimeImports:0,currentServiceEstablished:false},historicalReferencePilots:['Eurostat','Chile','Thailand'].map(source=>({source,tier:'historical-reference-pilot',runtimeImports:0})),accessPending:[{source:'Korea',state:'access-needed',lastObservedHttpStatus:null},{source:'Hong Kong',state:'pending-verification',lastObservedHttpStatus:403},{source:'Australia',state:'pending-verification',lastObservedHttpStatus:502}],nextSourceGap:{priority:1,sourceFamily:'Brazil ANAC SIROS cached registered-stage data',state:'carrier-mapping-needed',nextStep:'Extend primary carrier-identity mapping over the already cached snapshot, then rerun current/future/historical classification against the current runtime. Require separate current route evidence before any import.',networkSearchNeeded:false}};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({...good,routeEvidenceStatus:evidence}))));render(<DataProgressPage onNavigate={vi.fn()}/>);
 const panel=await screen.findByRole('region',{name:'現行路線圖與來源證據狀態'});
 expect(panel).toHaveTextContent('5,353');expect(panel).toHaveTextContent('31,650');expect(panel).toHaveTextContent('31,060');expect(panel).toHaveTextContent(evidence.runtimeSHA256);expect(panel).toHaveTextContent('1,693');
 expect(panel).toHaveTextContent('204 個方向');expect(panel).toHaveTextContent('先前批次 51');expect(panel).toHaveTextContent('REC／CGH 批次 127');expect(panel).toHaveTextContent('GIG 國際批次 18，通用品牌批次 8');expect(panel).toHaveTextContent('保留待查 59');
 expect(panel).toHaveTextContent('1,078,289');expect(panel).toHaveTextContent('688 個原始承運人方向');expect(panel).toHaveTextContent('426 個 OACI 機場對');expect(panel).toHaveTextContent('未匯入現行路線圖');
 expect(within(panel).getByRole('list',{name:'歷史參考試點'})).toHaveTextContent('Eurostat');expect(within(panel).getByRole('list',{name:'歷史參考試點'})).toHaveTextContent('Chile');expect(within(panel).getByRole('list',{name:'歷史參考試點'})).toHaveTextContent('Thailand');
 expect(within(panel).getByRole('list',{name:'待取得來源'})).toHaveTextContent('Korea');expect(within(panel).getByRole('list',{name:'待取得來源'})).toHaveTextContent('Hong Kong');expect(within(panel).getByRole('list',{name:'待取得來源'})).toHaveTextContent('HTTP 403');expect(within(panel).getByRole('list',{name:'待取得來源'})).toHaveTextContent('HTTP 502');
 expect(panel).toHaveTextContent('Brazil ANAC SIROS cached registered-stage data');expect(panel).toHaveTextContent('不需要重做廣泛網路搜尋');expect(panel).not.toHaveTextContent('% 全球完成');
});

import { DataProgressPage } from '../../src/components/DataProgressPage.tsx';
import { dataProgressSchema, avinorWindowExpired, progressIsStale } from '../../src/lib/data-progress.ts';
const good = { version: 1, generatedAt: '2026-10-01T18:00:00Z', state: 'verified', legacy: { total: 31349, published: 30760 }, qualified: { airports: 8798, routes: 0, services: 0, board: 2586, historical: 755, endpoints: 2916, sourceDate: '2026-10-01' } };
beforeEach(() => { localStorage.setItem('gcmp:locale', 'zh-TW'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('Data progress', () => {
  it('renders distinct validated tiers and navigates without changing the share hash', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(good)));
    vi.stubGlobal('fetch', fetch);
    window.history.replaceState({}, '', '/?view=progress#/r/preserved');
    const navigate = vi.fn(); render(<DataProgressPage onNavigate={navigate} />);
    expect(await screen.findByText(/31,349/)).toBeInTheDocument();
    expect(screen.getByText('2,916')).toBeInTheDocument();
    expect(screen.getByText(/尚未切換/)).toBeInTheDocument();
    const planner = screen.getByRole('link', { name: /規劃|Planner/ });
    expect(planner.getAttribute('href')).toContain('#/r/preserved');
    fireEvent.click(planner); expect(navigate).toHaveBeenCalledWith('planner');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/status/data-progress.json');
  });
  it('shows airport metadata additions separately from service and route evidence', async () => {
    const airportMetadataCollection = { state: 'reviewed', sourceDate: '2026-10-03', sourceSHA256: 'f'.repeat(64), sourceCandidates: 8798, flaggedYesCandidates: 4008, appCatalogBefore: 5101, appCatalogAfter: 5353, flaggedYesMappedAfter: 4008, remainingFlaggedYesCandidates: 0, admittedMetadataRows: 252, heldFlaggedYesOutsideAirportTypeScope: 124, heldSeaplaneBases: 71, heldHeliports: 53, runtimeSHA256: 'e'.repeat(64), runtimeRoutes: 31438, runtimePublishedRoutes: 30848, newRouteDirections: 0, currentServiceEstablished: false } as const;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...good, reviews: { siros: { state: 'missing' }, airportMetadataCollection } }))));
    render(<DataProgressPage onNavigate={vi.fn()} />);
    const panel = await screen.findByRole('region', { name: 'OurAirports 機場基本資料補充' });
    expect(panel).toHaveTextContent('新增 252 筆小型機場基本資料');
    expect(panel).toHaveTextContent('另有 124 個');
    expect(panel).toHaveTextContent('此次新增航線 0');
    expect(panel).toHaveTextContent('不能證明目前定期客運');
    expect(screen.getAllByText('8,798').length).toBeGreaterThanOrEqual(1);
  });
  it.each(['missing', 'failed'] as const)('shows %s without success numbers', async state => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...good, state, qualified: null }))));
    render(<DataProgressPage onNavigate={vi.fn()} />);
    await screen.findByText(state === 'missing' ? '尚未產生開放資料包。' : '開放資料包驗證未通過，暫不顯示成功筆數。');
    expect(screen.queryByText('2,916')).not.toBeInTheDocument();
  });
  it.each([new Response('missing', { status: 404 }), new Response('{}')])('handles missing or malformed status and retries', async response => {
    const fetch = vi.fn().mockResolvedValueOnce(response).mockResolvedValue(new Response(JSON.stringify(good)));
    vi.stubGlobal('fetch', fetch); render(<DataProgressPage onNavigate={vi.fn()} />);
    await screen.findByText(/目前無法讀取資料狀態/);
    fireEvent.click(screen.getByRole('button', { name: '重新讀取狀態' }));
    await screen.findByText('2,916'); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('aborts on leaving the page without rendering a late result', async () => {
    const fetch = vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('abort')))));
    vi.stubGlobal('fetch', fetch); const view = render(<DataProgressPage onNavigate={vi.fn()} />);
    const signal = fetch.mock.calls[0][1].signal;
    view.unmount(); expect(signal.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByText(/目前無法讀取/)).toBeNull());
  });
  it('does not mistake a fresh rebuild for fresh source data', () => {
    const data = dataProgressSchema.parse(good);
    expect(progressIsStale(data, new Date('2026-10-03'))).toBe(false);
    expect(progressIsStale(data, new Date('2026-10-09'))).toBe(true);
    expect(progressIsStale({ ...data, qualified: null }, new Date('2026-10-09'))).toBe(true);
    expect(dataProgressSchema.safeParse({ ...good, qualified: { ...good.qualified, routes: -1 } }).success).toBe(false);
  });
});

it('shows linked Avinor attribution and expires its short source window independently', async () => {
  const data = { ...good, qualified: { ...good.qualified, avinor: { references:159, rawFlights:160, held:1, capturedAt:'2026-10-02T07:29:50Z', from:'2026-10-02T05:45:00Z', until:'2026-10-02T14:00:00Z', confirmedNonstopDirections:0 } } };
  expect(avinorWindowExpired(dataProgressSchema.parse(data), new Date('2026-10-02T13:00:00Z'))).toBe(false);
  expect(avinorWindowExpired(dataProgressSchema.parse(data), new Date('2026-10-02T15:00:00Z'))).toBe(true);
  expect(avinorWindowExpired(dataProgressSchema.parse(good), new Date())).toBe(false);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
  render(<DataProgressPage onNavigate={vi.fn()} />);
  expect(await screen.findByText(/原始航班 160/)).toBeInTheDocument();
  expect(within(screen.getByRole('heading',{name:'OSL Avinor 時刻參考'}).closest('section')!).getByRole('link', { name:'Flight data from Avinor' })).toHaveAttribute('href','https://www.avinor.no');
  expect(screen.getByText(/可放行直飛方向 0/)).toBeInTheDocument();
});

it('separates SIROS research from selectable services and publication review', async()=>{
 const raw={...good,reviews:{siros:{state:'review',sourceDate:'2026-10-02',researchedRows:136,directionKeys:20,futureMissing:4,existingProofCandidates:16,coreRows:8,plannedDirections:[{key:'AA:DFW-GIG',effectiveFrom:'2026-12-18',effectiveUntil:'2027-03-01'}],newSelectable:0,publicPackage:'notice-review'}}};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(raw))));render(<DataProgressPage onNavigate={vi.fn()}/>);
 expect(await screen.findByText(/已研究：136/)).toBeInTheDocument();expect(screen.getByRole('list',{name:'未來計畫直飛方向'})).toHaveTextContent('AA:DFW-GIG');expect(screen.getByText(/高信心推論為已登記計畫直飛/)).toBeInTheDocument();expect(screen.getByText(/未來缺口 4 個；既有方向補強候選 16 個。新增可規劃直飛：0/)).toBeInTheDocument();expect(screen.getByText(/官方未指定版本；本機試接可繼續/)).toBeInTheDocument();
});
it.each(['missing','failed'] as const)('withholds SIROS success counts for %s review',async state=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({...good,reviews:{siros:{state}}}))));render(<DataProgressPage onNavigate={vi.fn()}/>);
 await screen.findByText(state==='missing'?'SIROS 研究資料尚未保存。':'SIROS 研究資料驗證未通過，暫不顯示成功筆數。');expect(screen.queryByText(/已研究：136/)).not.toBeInTheDocument();
});
it('keeps SkyTeam existing enrichment and future evidence separate from qualified counts and route selection',async()=>{
 const progress={state:'enriched',sourceDate:'2026-10-02',sourceCapturedAt:'2026-10-02T14:27:35.466746Z',sourceLastModified:'Fri, 02 Oct 2026 08:04:48 GMT',registrations:560,currentIntervalRegistrations:32,directions:[{key:'AF:CDG-GIG',registrations:95}],future:[{key:'DL:GIG-JFK',registrations:8,from:'2026-11-13',until:'2027-03-27'}],heldRecords:1,newCurrentDirections:0,newSelectable:0,publicPackage:'notice-review'};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({...good,reviews:{siros:{state:'missing'},sirosSkyteam:progress}}))));render(<DataProgressPage onNavigate={vi.fn()}/>);expect(await screen.findByText('SIROS SkyTeam 既有方向計畫證據')).toBeInTheDocument();expect(screen.getByText(/補入 560 筆/)).toHaveTextContent('新增 current 方向 0');expect(screen.getByText(/DL:GIG-JFK/)).toHaveTextContent('不可選航班');expect(screen.getByRole('link',{name:'AF:CDG-GIG'})).toHaveAttribute('href','/?view=routes&entity=route&id=CDG-GIG#/r/preserved');expect(screen.getByText(/版本未指定；此批/)).toBeInTheDocument();expect(screen.getByText('2,916')).toBeInTheDocument();
});
it('discloses Avinor passenger scope without nonstop, first-stage or operator promotion',async()=>{
 const {readFileSync}=await import('node:fs');const review=JSON.parse(readFileSync('docs/coverage-ledger/avinor-osl-semantics-20261003/review.json','utf8'));
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({...good,reviews:{siros:{state:'missing'},avinorSemantics:review}}))));render(<DataProgressPage onNavigate={vi.fn()}/>);expect(await screen.findByText('OSL Avinor 客運與停靠語義核驗')).toBeInTheDocument();expect(screen.getByText(/已補強 159 筆/)).toHaveTextContent('新增 current 航線 0');expect(screen.getByText(/J 排定客運與 C 包機客運/)).toBeInTheDocument();expect(screen.getByText(/WF141/)).toHaveTextContent('SOG, SDN');expect(screen.getByText(/WF163/)).toHaveTextContent('第一航段端點未知');expect(screen.getByText(/比較 97 個/)).toHaveTextContent('58 個未匹配');expect(screen.getByText(/此輪來源請求 0/)).toBeInTheDocument();expect(screen.getByRole('list',{name:'Avinor OSL 未匹配方向'}).children).toHaveLength(58);expect(screen.getByText('2,916')).toBeInTheDocument();
});

it('reports the three-carrier bulk SIROS source separately from current services and qualified counts',async()=>{
 const bulk={state:'reviewed',sourceDate:'2026-10-02',sourceSHA256:'a'.repeat(64),mappingVerifiedOn:'2026-10-03',runtimeSHA256:'b'.repeat(64),eligibleRegularPassengerStatusDateRows:65865,mappedAirportRows:65745,heldEndpointRows:120,directions:1375,distinctAirportPairs:1006,novelDirections:1375,novelPhysicalPairs:922,publishedPhysicalPairOverlapPairs:84,novelDirectionsWithExistingPhysicalPair:102,currentIntervalRows:2369,scheduledOnSnapshotDateRows:2369,futureStartRows:63376,novelCurrentDirections:921,novelFutureOnlyDirections:454,publishedOverlapRows:0,nonPublishedOverlapRows:0,airportMappingGaps:1,designatorQuarantineRows:317,clockConflictPairs:69,acceptedCurrentRoutes:0,readyImports:0,qualifiedPackageImports:0,publicDistribution:'notice-review',licenseVersion:null,byCarrier:Object.fromEntries(['JJ','G3','AD'].map(code=>[code,{registeredDirections:414,eligibleRows:100,mappedAirportRows:99,periodRows:4,scheduledOnSnapshotDateRows:4,futureRows:96,publishedOverlapRows:0,nonPublishedOverlapRows:0,novelCurrentDirections:2,novelFutureDirections:3,designatorQuarantineRows:1}])),examples:[{key:'JJ:SDU-CGH',pair:'SDU-CGH',registrationRows:498,futureOnly:false,physicalPairPublishedOverlap:false}]};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({...good,reviews:{siros:{state:'missing'},sirosBrazilBulk:bulk}}))));render(<DataProgressPage onNavigate={vi.fn()}/>);
 expect(await screen.findByText('巴西 SIROS 三家航空公司批次（暫存審查）')).toBeInTheDocument();const bulkPanel=screen.getByRole('region',{name:'巴西 SIROS 三家航空公司批次（暫存審查）'});expect(bulkPanel).toHaveTextContent('65,865 筆符合');expect(bulkPanel).toHaveTextContent('1,375個登記公司方向鍵');expect(bulkPanel).toHaveTextContent('原始公司碼映射日 2026-10-03');expect(bulkPanel).toHaveTextContent('TAM→JJ、GLO→G3、AZU→AD');expect(bulkPanel).toHaveTextContent('實際已飛及轉機人權未驗證');expect(bulkPanel).toHaveTextContent('可匯入0');expect(within(bulkPanel).queryByRole('button')).not.toBeInTheDocument();
});
it('shows PAL seasonal direction candidates with topology and operator holds',async()=>{
 const progress={state:'reviewed',sourceDate:'2026-09-08',serviceWindow:{from:'2026-03-29',until:'2026-10-24'},factsSHA256:'c'.repeat(64),sourceRows:82,normalizedDirections:82,distinctOrderedAirportDirections:82,uniqueAirports:29,bidirectionalPairs:41,marketingCarrier:'PR',operatorIdentity:'unresolved-per-flight',stopFieldsPresent:false,exactRuntimeKeys:0,exactPublishedKeys:0,exactNonPublishedKeys:0,exactMissingKeys:82,publishedPhysicalDirectionCoverage:4,noPublishedPhysicalDirectionCoverage:78,heldNoTopologyProof:82,admittedRoutes:0};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({...good,reviews:{siros:{state:'missing'},palSummerInventory:progress}}))));render(<DataProgressPage onNavigate={vi.fn()}/>);const heading=await screen.findByText('Philippine Airlines 2026 夏季表列方向（暫存候選）');const panel=heading.closest('section')!;expect(panel).toHaveTextContent('82 個方向列');expect(panel).toHaveTextContent('41 組雙向機場對');expect(panel).toHaveTextContent('78 個方向無已發布機場方向覆蓋');expect(panel).toHaveTextContent('Air Philippines 2xxx');expect(panel).toHaveTextContent('航線放行 0');expect(within(panel).getByRole('link',{name:'查看 PAL 官方 2026 夏季國內班表'})).toHaveAttribute('href','https://www.philippineairlines.com/content/dam/palportal/migration/feature/timetable/260908-Domestic-Summer-Sep-08-2026.pdf');
});
