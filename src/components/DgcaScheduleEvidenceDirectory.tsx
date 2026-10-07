import { useEffect, useMemo, useState } from 'react';
import {
  dgcaSourceReviewState,
  dgcaDraftDateStatus,
  DgcaScheduleEvidenceCatalogSchema,
  DgcaScheduleDraftReferenceSchema,
  matchesDgcaIdentityWindow,
  type DgcaScheduleEvidenceCatalog,
  type DgcaScheduleDraftReference,
} from '../lib/schemas/dgca-schedule-evidence.ts';
import { siteAssetHref } from '../lib/site-navigation.ts';
import { useEvidenceClock } from '../lib/use-evidence-clock.ts';
import './DgcaScheduleEvidenceDirectory.css';

interface Props {
  readonly zh: boolean;
  readonly onPlanReference: (reference: DgcaScheduleDraftReference, date: string) => void;
}

function raw(value: string): string { return value === '' ? '(blank in source)' : value; }

function rawList(values: readonly string[]): string {
  return values.length === 0 ? '(not printed for this movement)' : values.map(raw).join(' · ');
}

export function DgcaScheduleEvidenceDirectory({ zh, onPlanReference }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<DgcaScheduleEvidenceCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [sourceId, setSourceId] = useState('all');
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    if (!open || catalog || failed) return;
    const controller = new AbortController();
    void fetch(siteAssetHref('data/dgca-schedule-evidence-20261007.json'), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('DGCA schedule evidence unavailable');
        const parsed = DgcaScheduleEvidenceCatalogSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setCatalog(parsed);
          setDate(previous => previous || parsed.snapshotAsOfDate);
        }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, catalog, failed, retryKey]);

  const normalizedQuery = query.trim().toUpperCase();
  const deadlines = catalog?.sources.map(source => source.reviewBy).filter((value): value is string => value !== null) ?? [];
  const evidenceNow = useEvidenceClock(deadlines);
  const filtered = useMemo(() => {
    if (!catalog) return [];
    return catalog.sources.flatMap(source => sourceId !== 'all' && source.id !== sourceId ? [] : source.references
      .filter(reference => !normalizedQuery || [
        reference.publishedDesignatorRaw, reference.designatorKey, reference.originIata, reference.destinationIata,
        `${reference.originIata}-${reference.destinationIata}`,
      ].some(value => value.toUpperCase().includes(normalizedQuery)))
      .map(reference => ({ source, reference })));
  }, [catalog, normalizedQuery, sourceId]);

  const copy = zh ? {
    title: 'DGCA 核准班表身份證據',
    intro: '唯讀的 DGCA 已核准班表身份證據。來源列示的班號與方向、原始頻率、時刻和各自有效期間均予保留。這些資料不證明所選日期有航班或實際運航，也不會新增可選航班、星期班次、UTC 班次或接駁時間。來源未列出或未納入此目錄，不代表沒有航班。',
    loading: '載入 DGCA 班表證據…', failed: 'DGCA 班表證據目前無法讀取。', retry: '重試',
    search: '搜尋班號或機場代碼', sourceFilter: '來源', allSources: '全部來源',
    sourceDate: '來源身份有效期間參考日（非航班可用性）', count: '筆來源身份參考',
    sourceWindow: '來源身份有效期間（起訖日均包含）', inside: '日期落在至少一個來源身份有效期間內；該日班次及實際運航仍未知。',
    outside: '日期不在來源身份有效期間內；不代表沒有航班。',
    details: '來源變體、原始欄位與頁列依據',
    sourceStatus: '來源截至快照狀態',
    sourceRows: '來源頁／列', frequency: '來源頻率原文', clocks: '來源時刻原文', aircraft: '來源機型原文',
    rowTextHash: '來源列文字 SHA-256',
    rowRelation: '來源列關係', oneSided: '來源列出單一方向；未推測反向航段', paired: '同一來源變體同時列有到達與出發移動列',
    airportUnmapped: '來源機場代碼尚未匹配目前 GCMP 機場目錄；保留為來源參考，不加入可用航線。這不代表沒有航班。',
    unknownTime: '時區未定義；不作轉換', conflict: '來源變體有差異；保留原始值與標記。時刻標記不代表航班身份矛盾。',
    metadata: '來源、身份說明與顯名', pdfHash: 'PDF SHA-256', sourceLink: '開啟 DGCA 原始 PDF',
    addDraft: '加入草稿（來源身份參考）',
    weekdaySupported: '另源佐證的星期包含此日期；仍未知是否有班次或實際運航。',
    weekdayNotSupported: '另源佐證的星期不包含此日期；此參考不能用於所選日期。',
    weekdayUnknown: '星期解讀未知；僅能確認身份有效期間，不代表該星期有班次。',
    weekdayConflict: '來源班次頻率欄位有衝突；無法判定所選星期。',
    sourceAttributionKnown: 'DGCA 來源歸屬身份有另源對照；不代表實際運航或聯盟／環球票資格。',
    sourceAttributionUnknown: 'DGCA 未確認營運航空公司；航空公司與聯盟身份維持未知。',
    checked: '核驗', reviewBy: '覆核期限', snapshotOnly: '僅保留核驗快照日期，未設定期限',
    currentReview: '覆核期限仍有效', expiredReview: '覆核期限已過', futureReview: '核驗時間尚未到達',
    unknownCarrier: '營運者身份未由來源確認', mappedCarrier: '來源歸屬身份獨立交叉核對',
    excluded: '排除項目', conflicts: '變體重疊／衝突摘要', showMore: '顯示更多', empty: '沒有符合的來源身份參考。',
    asOf: '快照截至', pages: '頁', bytes: '位元組', unloadedSummary: 'SpiceJet、IndiGo、Air India、Air India Express',
  } : {
    title: 'DGCA approved-schedule identity evidence',
    intro: 'Read-only identity evidence from DGCA-approved schedules. The published designators, directions, raw frequencies, clocks, and each source validity window are retained. These records do not establish a flight on the selected date or actual operation, and they add no selectable service, weekday schedule, UTC occurrence, or connection timing. A reference omitted or absent here does not prove that no flight exists.',
    loading: 'Loading DGCA schedule evidence…', failed: 'DGCA schedule evidence is temporarily unavailable.', retry: 'Retry',
    search: 'Search designator or airport code', sourceFilter: 'Source', allSources: 'All sources',
    sourceDate: 'Source identity-window date (not flight availability)', count: 'source identity references',
    sourceWindow: 'Source identity windows (inclusive dates)', inside: 'The date falls within at least one source identity window; service on that date and actual operation remain unknown.',
    outside: 'The date is outside the source identity windows; this does not prove no flight exists.',
    details: 'Source variants, raw fields and page/row evidence',
    sourceStatus: 'Source status as of snapshot',
    sourceRows: 'Source page/row', frequency: 'Raw source frequency', clocks: 'Raw source clocks', aircraft: 'Raw source aircraft',
    rowTextHash: 'Source-row text SHA-256',
    rowRelation: 'Source-row relation', oneSided: 'The source lists one direction; no reverse leg is inferred', paired: 'The same source variant lists arrival and departure movement rows',
    airportUnmapped: 'A source endpoint code is not matched in the current GCMP airport catalog. It stays as source evidence and is not added as a route; this does not mean there is no flight.',
    unknownTime: 'Timezone unspecified; no conversion', conflict: 'Source variants differ; raw values and flags are preserved. A timing flag is not a flight-identity conflict.',
    metadata: 'Sources, identity qualification and attribution', pdfHash: 'PDF SHA-256', sourceLink: 'Open original DGCA PDF',
    addDraft: 'Add to draft (source identity reference)',
    weekdaySupported: 'A separate weekday annotation includes this date; service and actual operation remain unknown.',
    weekdayNotSupported: 'The separately corroborated weekday annotation excludes this date; this reference cannot be added for the selected date.',
    weekdayUnknown: 'Weekday interpretation is unknown; only the identity window is supported, not service on that weekday.',
    weekdayConflict: 'Source frequency fields conflict; the selected weekday cannot be determined.',
    sourceAttributionKnown: 'DGCA source attribution is independently mapped; actual operation and alliance/award eligibility are not established.',
    sourceAttributionUnknown: 'DGCA does not identify the operating airline; airline and alliance identity remain unknown.',
    checked: 'Checked', reviewBy: 'Review by', snapshotOnly: 'Snapshot date retained; no review deadline supplied',
    currentReview: 'Source review window is current', expiredReview: 'Source review window expired', futureReview: 'Source check is in the future',
    unknownCarrier: 'Carrier identity unresolved by the DGCA source', mappedCarrier: 'Source attribution independently cross-checked',
    excluded: 'Excluded records', conflicts: 'Variant overlap/conflict summary', showMore: 'Show more', empty: 'No source identity references match this search.',
    asOf: 'snapshot as of', pages: 'pages', bytes: 'bytes', unloadedSummary: 'SpiceJet, IndiGo, Air India, and Air India Express',
  };

  const totalReferences = catalog?.sources.reduce((total, source) => total + source.counts.currentReferences, 0) ?? 0;
  const totalVariants = catalog?.sources.reduce((total, source) => total + source.counts.currentVariants, 0) ?? 0;

  return (
    <section className="dgca-schedule-evidence-directory" data-dgca-schedule-evidence-directory>
      <details open={open} onToggle={event => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (nextOpen && !catalog && !failed) setLoading(true);
      }}>
        <summary><strong>{copy.title}</strong><span>{catalog ? `${totalReferences.toLocaleString()} identities · ${totalVariants.toLocaleString()} source variants` : copy.unloadedSummary}</span></summary>
        <div className="dgca-schedule-evidence-directory__body">
          <p>{copy.intro}</p>
          {loading && <p role="status">{copy.loading}</p>}
          {failed && <p role="alert">{copy.failed} <button type="button" onClick={() => { setLoading(true); setFailed(false); setRetryKey(key => key + 1); }}>{copy.retry}</button></p>}
          {catalog && <>
            <p>{totalReferences.toLocaleString()} {copy.count} · {totalVariants.toLocaleString()} {zh ? '個有效期間來源變體' : 'source-window variants'} · {copy.asOf} {catalog.snapshotAsOfDate}</p>
            <div className="dgca-schedule-evidence-directory__filters">
              <label>{copy.search}<input type="search" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(20); }} /></label>
              <label>{copy.sourceFilter}<select value={sourceId} onChange={event => { setSourceId(event.target.value); setVisibleCount(20); }}>
                <option value="all">{copy.allSources}</option>
                {catalog.sources.map(source => <option key={source.id} value={source.id}>{source.operator.printedNameRaw ?? source.title}</option>)}
              </select></label>
              <label>{copy.sourceDate}<input type="date" value={date} onChange={event => { setDate(event.target.value); setVisibleCount(20); }} /></label>
            </div>
            <p className="dgca-schedule-evidence-directory__count">{filtered.length.toLocaleString()} {copy.count}</p>
            {filtered.length === 0 ? <p>{copy.empty}</p> : <ul>
              {filtered.slice(0, visibleCount).map(({ source, reference }) => {
                const withinWindow = matchesDgcaIdentityWindow(reference, date);
                const weekdayStatus = dgcaDraftDateStatus(reference, date);
                const airportPairKnown = reference.airportCatalogStatus === 'all-endpoints-present';
                const canAdd = withinWindow && airportPairKnown && weekdayStatus !== 'weekday-not-supported';
                const windows = [...new Set(reference.variants.map(variant => `${variant.effectiveFrom} → ${variant.effectiveUntil}`))];
                return <li key={`${source.id}:${reference.id}`} data-dgca-reference={reference.id} data-source-id={source.id} data-source-window={withinWindow ? 'inside' : 'outside'}>
                  <div className="dgca-schedule-evidence-directory__identity"><strong>{reference.designatorKey}</strong><span>{reference.originIata} → {reference.destinationIata}</span><small>{source.operator.printedNameRaw ?? source.title}</small></div>
                  {reference.airportCatalogStatus === 'source-code-not-in-current-catalog' && <small data-airport-catalog-status="unmatched">{copy.airportUnmapped} ({reference.originIata}, {reference.destinationIata})</small>}
                  <p>{copy.sourceWindow}: {windows.join(' · ')}</p>
                  <small>{withinWindow ? copy.inside : copy.outside}</small>
                  {withinWindow && <small data-dgca-weekday-status={weekdayStatus}>{copy[weekdayStatus === 'weekday-supported' ? 'weekdaySupported' : weekdayStatus === 'weekday-not-supported' ? 'weekdayNotSupported' : weekdayStatus === 'weekday-conflict' ? 'weekdayConflict' : 'weekdayUnknown']}</small>}
                  <small data-dgca-carrier-attribution={source.operator.carrierIdentityStatus}>
                    {source.operator.carrierIdentityStatus === 'independently-mapped' ? copy.sourceAttributionKnown : copy.sourceAttributionUnknown}
                  </small>
                  {canAdd && <button type="button" data-plan-dgca-reference={`${source.id}:${reference.id}`} onClick={() => {
                    const draftReference = DgcaScheduleDraftReferenceSchema.parse({
                      source: {
                        id: source.id, title: source.title, url: source.url, pdfSha256: source.pdfSha256,
                        publishedDateRaw: source.publishedDateRaw, checkedAt: source.checkedAt, reviewBy: source.reviewBy,
                        reviewedSnapshotDate: source.reviewedSnapshotDate, attribution: source.attribution,
                        reusePolicyUrl: source.reusePolicyUrl, reusePolicyStatement: source.reusePolicyStatement,
                        operator: source.operator,
                      },
                      reference,
                      catalogSnapshotAsOfDate: catalog.snapshotAsOfDate,
                    });
                    onPlanReference(draftReference, date);
                  }}>{copy.addDraft} · {date}</button>}
                  {reference.hasVariantConflict && <small>{copy.conflict}</small>}
                  <details>
                    <summary>{copy.details} · {reference.variants.length}</summary>
                    {reference.variants.map(variant => <div className="dgca-schedule-evidence-directory__variant" key={variant.id} data-dgca-variant={variant.id}>
                      {variant.sourceStatusAsOf && <p>{copy.sourceStatus}: <code>{variant.sourceStatusAsOf}</code></p>}
                      <p><strong>{variant.effectiveFromRaw} → {variant.effectiveUntilRaw}</strong> · {variant.id}</p>
                      <p>{copy.frequency}: <code>{raw(variant.frequencyRaw)}</code> · {copy.clocks}: <code>{rawList(variant.departureClockValuesRaw)} → {rawList(variant.arrivalClockValuesRaw)}</code> ({copy.unknownTime}) · {copy.aircraft}: <code>{rawList(variant.aircraftTypeValuesRaw)}</code></p>
                      <p>{copy.sourceRows}: {variant.sourceRows.map(row => <span className="dgca-schedule-evidence-directory__lineage" key={row.referenceRaw}>
                        <code>{row.referenceRaw}</code> · p.{row.page}{row.physicalRow ? ` · physical row ${row.physicalRow}` : ''}{row.stationSectionOrdinal ? ` · section ${row.stationSectionOrdinal}` : ''}{row.stationSectionRaw ? ` · ${row.stationSectionRaw}` : ''}{row.printedRowRaw ? ` · printed row ${row.printedRowRaw}` : ''}{row.sourceSide ? ` · ${row.sourceSide}` : ''}{row.sourceRowSha256 ? ` · lineage SHA-256 ${row.sourceRowSha256}` : ''}{row.sourceRowTextSha256 ? ` · ${copy.rowTextHash} ${row.sourceRowTextSha256}` : ''}
                      </span>)}</p>
                      <p>{copy.rowRelation}: {variant.sourceCounterpartStatus === 'paired' ? copy.paired : copy.oneSided}{variant.sourceMovementSides.length > 0 ? ` · ${variant.sourceMovementSides.join(', ')}` : ''}</p>
                      {variant.stationLabelsRaw.length > 0 && <p>{zh ? '來源站名' : 'Raw station labels'}: {variant.stationLabelsRaw.join(' · ')} · {variant.stationCodeResolution}</p>}
                      {variant.frequencyWeekdaysCorroborated.length > 0 && <p>{zh ? 'AAI 另源對照（非 DGCA 定義，不用於推算日期）' : 'Separate AAI weekday annotation (not defined by DGCA and not used to generate dates)'}: {variant.frequencyWeekdaysCorroborated.join(', ')}</p>}
                      {(variant.conflictIds.length > 0 || variant.conflictFields.length > 0) && <p>{copy.conflicts}: {variant.conflictKinds.join(', ')} · {variant.conflictFields.join(', ')} · {variant.conflictIds.join(', ')}</p>}
                      {variant.conflictEvidence.length > 0 && <ul data-dgca-overlap-flags>{variant.conflictEvidence.map(evidence => <li key={evidence.id}>
                        <code>{evidence.id}</code> · {evidence.peerVariantId} · {evidence.overlapFrom} → {evidence.overlapUntil} · {evidence.differingRawFields.join(', ')} · {evidence.interpretation}
                      </li>)}</ul>}
                      <details className="dgca-schedule-evidence-directory__notes"><summary>{zh ? '來源說明' : 'Source qualifications'}</summary><ul>{variant.notes.map((note, index) => <li key={`${variant.id}:note:${index}`}>{note}</li>)}</ul></details>
                    </div>)}
                  </details>
                </li>;
              })}
            </ul>}
            {filtered.length > visibleCount && <button type="button" onClick={() => setVisibleCount(count => count + 20)}>{copy.showMore}</button>}
            <details className="dgca-schedule-evidence-directory__sources">
              <summary>{copy.metadata}</summary>
              {catalog.sources.map(source => {
                const reviewState = dgcaSourceReviewState(source, evidenceNow);
                const reviewLabel = reviewState === 'current-review' ? copy.currentReview
                  : reviewState === 'checked-in-future' ? copy.futureReview
                    : reviewState === 'review-window-expired' ? copy.expiredReview : copy.snapshotOnly;
                const expiredOnlyCount = source.counts.excludedExpiredOnlyIdentityKeys ?? (zh ? '未單獨計算' : 'not separately counted');
                return <section key={source.id} data-dgca-source={source.id}>
                  <h3>{source.title}</h3>
                  <p>{source.attribution} · {reviewLabel} · {copy.asOf} {source.reviewedSnapshotDate}</p>
                  <p>{source.operator.printedNameRaw ?? ''}{source.operator.operatorCodeRaw ? ` · operator code ${source.operator.operatorCodeRaw}` : ''} · {source.operator.qualification}</p>
                  <p>{source.counts.currentReferences.toLocaleString()} {copy.count} · {source.counts.currentVariants.toLocaleString()} {zh ? '個現行來源變體' : 'current variants'} · {copy.excluded}: {source.counts.excludedExpiredVariants} {zh ? '個逾期變體' : 'expired variants'}, {source.counts.excludedHeldVariants} {zh ? '筆暫存來源列' : 'held source rows'}, {expiredOnlyCount} {zh ? '個僅逾期身份鍵' : 'expired-only identity keys'}</p>
                  <p>{copy.conflicts}: {source.counts.overlapPairs} {zh ? '組重疊' : 'overlap pairs'} · {source.counts.conflictVariants} {zh ? '個標記變體' : 'flagged variants'} · {source.counts.conflictingCoreIdentityPairs} {zh ? '組核心身份矛盾' : 'core-identity conflicts'}</p>
                  {source.checkedAt && <p>{copy.checked}: {source.checkedAt}{source.reviewBy ? ` · ${copy.reviewBy}: ${source.reviewBy}` : ''}</p>}
                  <p>{copy.pdfHash}: <code>{source.pdfSha256}</code> · {source.pdfBytes.toLocaleString()} {copy.bytes} · {source.pages} {copy.pages}</p>
                  <p>{source.reusePolicyStatement}</p>
                  <p><a href={source.url} target="_blank" rel="noreferrer">{copy.sourceLink}</a> · <a href={source.reusePolicyUrl} target="_blank" rel="noreferrer">DGCA website policy</a>{source.operator.identitySourceUrl ? <> · <a href={source.operator.identitySourceUrl} target="_blank" rel="noreferrer">{copy.mappedCarrier}</a></> : <span> · {copy.unknownCarrier}</span>}</p>
                  <details><summary>{zh ? '保留的來源統計' : 'Retained source-specific counts'}</summary><dl>{Object.entries(source.sourceSpecificCounts).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value.toLocaleString()}</dd></div>)}</dl></details>
                </section>;
              })}
            </details>
          </>}
        </div>
      </details>
    </section>
  );
}
