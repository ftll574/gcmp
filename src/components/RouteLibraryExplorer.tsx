import {CaliPrimaryReferences} from './CaliPrimaryReferences.tsx';
import {OfficialRouteReferences} from './OfficialRouteReferences.tsx';
import { CaaWeeklyScheduleRouteEvidence } from './CaaWeeklyScheduleRouteEvidence.tsx';
import { useCaaPublishedTimetables } from '../lib/use-caa-published-timetables.ts';
import { CaaPublishedTimetableEvidence } from './CaaPublishedTimetableEvidence.tsx';
import { useEvidenceClock } from '../lib/use-evidence-clock.ts';
import { avinorOslDepartureDate, nextEvidenceDeadline } from '../lib/rtw/time-bound-flight-numbers.ts';
import { sourceReviewState, sourceReviewStatusLabel } from '../lib/rtw/route-date-semantics.ts';
import { airportIdentityLabel } from '../lib/airport-identity.ts';
import { buildAirportIndex } from '../lib/airport-index.ts';
import { lazy, Suspense, useMemo, useState } from 'react';
import type { ContinentId } from '../lib/schemas/country-continent.ts';
import type { LandingShowcaseCatalog } from '../lib/schemas/landing-showcase.ts';
import type { RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { Airport } from '../lib/types.ts';
import {
  buildAirportEntityProfile,
  buildAirlineEntityProfile,
  buildLandingShowcaseFingerprint,
  buildRouteLibraryFingerprint,
  buildRouteEntityProfile,
  routeLibraryEntityContinent,
  searchLandingShowcaseEntities,
  searchRouteLibraryEntities,
  type RouteLibraryEntitySelection,
  type RouteLibraryRouteCard,
} from '../lib/rtw/route-library-entities.ts';
import { useLocale } from '../i18n/use-locale.ts';
import type { RouteMapAllianceTheme } from './RouteLibraryMap.tsx';
import { RouteLibraryMapPreview, type RouteLibraryMapPreviewStat } from './RouteLibraryMapPreview.tsx';
import { RegisteredPlansEvidence } from './RegisteredPlansEvidence.tsx';
import './RouteLibraryExplorer.css';
import '../explorer-redesign.css';

const LazyRouteEntityMap = lazy(() =>
  import('./RouteLibraryMap.tsx').then((module) => ({ default: module.RouteEntityMap })),
);

function RouteMapLoading({ zh, routes, stats }: {
  readonly zh: boolean;
  readonly routes: ReadonlyArray<RouteLibraryRouteCard>;
  readonly stats: ReadonlyArray<RouteLibraryMapPreviewStat>;
}): React.ReactElement {
  return <RouteLibraryMapPreview zh={zh} routes={routes} stats={stats} />;
}

interface PlanRouteInput {
  readonly from: string;
  readonly to: string;
  readonly carrier: string;
  readonly flightNumber?: string | undefined;
  readonly departsOn?: string | undefined;
}

interface Props {
  readonly network: RouteNetworkCatalog;
  readonly routeMapPreview?: LandingShowcaseCatalog | null | undefined;
  readonly airports: ReadonlyMap<string, Airport>;
  readonly carrierNames: ReadonlyMap<string, string>;
  readonly memberCodes: ReadonlySet<string>;
  readonly countryContinents?: ReadonlyMap<string, ContinentId> | null | undefined;
  readonly airportContinentOverrides?: ReadonlyMap<string, ContinentId> | null | undefined;
  readonly selection: RouteLibraryEntitySelection | null;
  readonly onSelect: (selection: RouteLibraryEntitySelection | null) => void;
  readonly onPlanRoute: (route: PlanRouteInput) => void;
  readonly alliance: RouteMapAllianceTheme;
  readonly onAllianceChange: (alliance: RouteMapAllianceTheme) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly networkComplete?: boolean | undefined;
  readonly fullNetworkLoading?: boolean | undefined;
  readonly fullNetworkError?: string | null | undefined;
  readonly onRequestFullNetwork?: (() => void) | undefined;
  readonly onRetryFullNetwork?: (() => void) | undefined;
}

function routeId(route: RouteLibraryRouteCard): string {
  return `${route.from.iata}-${route.to.iata}`;
}

function RouteCard({ route, onSelect, compact = false }: {
  readonly route: RouteLibraryRouteCard;
  readonly onSelect: (selection: RouteLibraryEntitySelection) => void;
  readonly compact?: boolean;
}): React.ReactElement {
  const numbers = route.carriers.flatMap((carrier) => carrier.confirmedNumbers).slice(0, compact ? 3 : 5);
  return (
    <button type="button" className={`entity-route-card${compact ? ' compact' : ''}`} onClick={() => onSelect({ kind: 'route', id: routeId(route) })}>
      <span className="entity-route-codes"><code>{route.from.iata}</code><b>→</b><code>{route.to.iata}</code></span>
      <strong>{route.to.city}</strong>
      <small>{route.carriers.map((carrier) => carrier.carrierEntityKey ? `${carrier.carrier} · ${carrier.name}` : carrier.carrier).join(' · ')} · {route.distanceNm.toLocaleString()} nm</small>
      {numbers.length > 0 && <span className="entity-route-number-preview">{numbers.join(' · ')}</span>}
    </button>
  );
}

export function RouteLibraryExplorer({
  network,
  routeMapPreview,
  airports,
  carrierNames,
  memberCodes,
  countryContinents,
  airportContinentOverrides,
  selection,
  onSelect,
  onPlanRoute,
  alliance,
  onAllianceChange,
  query,
  onQueryChange,
  networkComplete = true,
  fullNetworkLoading = false,
  fullNetworkError = null,
  onRequestFullNetwork,
  onRetryFullNetwork,
}: Props): React.ReactElement {
  const { locale, t } = useLocale();
  const evidenceNow = useEvidenceClock(nextEvidenceDeadline(
    network.sources,
    network.routes.flatMap(route => (route.timeBoundFlightNumbers ?? []).flatMap(evidence => evidence.occurrencesUTC)),
  ));
  const caaPair = selection?.kind === 'route' && selection.id.split('-').some(code => airports.get(code)?.country === 'TW') ? selection.id : null;
  const caaReferences = useCaaPublishedTimetables(caaPair);
  const zh = locale === 'zh-TW';
  const [searchOpen, setSearchOpen] = useState(false);
  const [showRouteIndex, setShowRouteIndex] = useState(false);
  const airportIndex = useMemo(() => buildAirportIndex([...airports.values()]), [airports]);
  const entityMemberCodes = useMemo<ReadonlySet<string>>(() => {
    if (selection?.kind !== 'airline' || !selection.id.includes('+')) return memberCodes;
    const carrier = network.routes.find(route => route.carrierEntityKey === selection.id)?.carrier;
    return carrier ? new Set([...memberCodes, carrier]) : memberCodes;
  }, [memberCodes, network, selection]);
  const entityInput = useMemo(() => ({ network, airports, carrierNames, memberCodes: entityMemberCodes, evidenceNow }), [network, airports, carrierNames, entityMemberCodes, evidenceNow]);
  const searchResults = useMemo(
    () => {
      const locale = zh ? 'zh-TW' : 'en';
      const routeResults = [
        ...(!networkComplete && !selection
          ? searchLandingShowcaseEntities(routeMapPreview, airports, query, memberCodes, locale)
          : []),
        ...searchRouteLibraryEntities({ ...entityInput, query, locale }),
      ];
      const airportResults = airportIndex.search(query, { limit: 6, locale }).map(({ airport, match }) => ({
        key: `airport:${airport.iata}`,
        selection: { kind: 'airport' as const, id: airport.iata },
        kind: 'airport' as const,
        title: `${airport.iata} · ${airport.city}`,
        subtitle: `${airport.name} · ${airport.country}${match === 'city-code' ? ` · ${query.toUpperCase()}` : ''}`,
      }));
      const priority = airportResults.filter(result => result.subtitle.endsWith(` · ${query.toUpperCase()}`));
      const merged = new Map<string, typeof routeResults[number]>();
      for (const result of [...priority, ...routeResults, ...airportResults]) if (!merged.has(result.key)) merged.set(result.key, result as typeof routeResults[number]);
      return [...merged.values()];
    },
    [airports, entityInput, memberCodes, networkComplete, query, routeMapPreview, selection, zh, airportIndex],
  );
  const homeModel = useMemo(() => {
    if (selection) return null;
    return {
      fingerprint: !networkComplete && routeMapPreview
        ? buildLandingShowcaseFingerprint(routeMapPreview, airports, memberCodes)
        : buildRouteLibraryFingerprint(entityInput, alliance === 'all' ? 150 : 120),
    };
  }, [selection, routeMapPreview, networkComplete, airports, entityInput, alliance, memberCodes]);
  const profiles = useMemo(() => ({
    airport: selection?.kind === 'airport' ? buildAirportEntityProfile(entityInput, selection.id) : null,
    airline: selection?.kind === 'airline' ? buildAirlineEntityProfile(entityInput, selection.id) : null,
    route: selection?.kind === 'route' ? buildRouteEntityProfile(entityInput, selection.id) : null,
  }), [entityInput, selection]);
  const airportProfile = profiles.airport;
  const airlineProfile = profiles.airline;
  const routeProfile = profiles.route;

  const continentLabel = (continent: ContinentId | 'unmapped'): string => continent === 'unmapped'
    ? (zh ? '未分類' : 'Unmapped')
    : t(`rtw.continent.${continent}`);
  const choose = (next: RouteLibraryEntitySelection): void => {
    setSearchOpen(false);
    setShowRouteIndex(false);
    onSelect(next);
  };

  const mapControls = {
    alliance,
    onAllianceChange: (next: RouteMapAllianceTheme): void => {
      setShowRouteIndex(false);
      onAllianceChange(next);
    },
    query,
    onQueryChange: (value: string): void => {
      onQueryChange(value);
      setSearchOpen(value.length > 0);
    },
    searchOpen,
    onSearchOpenChange: setSearchOpen,
    searchPlaceholder: zh
      ? '搜尋機場、城市、航空公司、航線或班號，例如 TPE / Tokyo / BR198…'
      : 'Search airport, city, airline, route or flight number, e.g. TPE / Tokyo / BR198…',
    searchDisabled: false,
    searchDisabledLabel: zh ? '載入完整航網後可使用完整搜尋' : 'Full search is available after loading the full network',
    searchNeedsFullNetwork: !networkComplete,
    searchPartialLabel: (count: number): string => zh
      ? `部分搜尋結果：${count} 筆。載入完整航網可搜尋其他航線與班號。`
      : `Partial results: ${count}. Load the full network to search additional routes and flight numbers.`,
    searchPartialEmptyLabel: zh
      ? '完整航網尚未搜尋；目前沒有預覽命中，不代表全球沒有符合航線或班號。'
      : 'The full network has not been searched. No preview matches does not mean there are no matching routes or flight numbers.',
    searchFullLoadingLabel: zh ? '正在搜尋完整航網…' : 'Searching the full network…',
    searchLoadErrorLabel: zh ? '完整航網搜尋失敗' : 'Full-network search failed',
    searchNoResultsLabel: zh ? '完整航網搜尋完成，沒有符合的結果。' : 'Full-network search is complete. No matching results.',
    loadFullSearchLabel: fullNetworkLoading
      ? (zh ? '正在搜尋全部航線與班號…' : 'Searching all routes and flight numbers…')
      : fullNetworkError
        ? (zh ? '重試完整搜尋' : 'Retry full search')
        : (zh ? '搜尋全部航線與班號' : 'Search all routes and flight numbers'),
    fullNetworkLoading,
    fullNetworkError,
    onRequestFullNetwork,
    onRetryFullNetwork,
    partialMapHelp: selection?.kind === 'airport'
      ? (zh ? '已載入此機場所有出發航線；可以拖曳與縮放地圖，載入完整航網後可使用完整搜尋與抵達統計。' : 'All outbound routes for this airport are loaded; pan and zoom the map, then load the full network for global search and inbound statistics.')
      : selection?.kind === 'airline'
        ? (zh ? '已載入此航空公司的完整航網；可以拖曳與縮放地圖，載入全球航網後可使用跨航空公司的完整搜尋。' : 'This airline’s complete network is loaded; pan and zoom the map, then load the global network for cross-airline search.')
        : (zh ? '目前只載入這條航線；可以拖曳與縮放地圖，載入完整航網後可使用完整搜尋。' : 'Only this route is loaded right now; pan and zoom the map, then load the full network for global search.'),
    partialFallbackHelp: selection?.kind === 'airport'
      ? (zh ? '仍可使用下方目的地列表瀏覽此機場的完整出發航網。' : 'Use the destination list below to browse the airport’s complete outbound network.')
      : selection?.kind === 'airline'
        ? (zh ? '仍可使用下方航線列表瀏覽此航空公司的完整航網。' : 'Use the route list below to browse this airline’s complete network.')
        : (zh ? '仍可使用下方航線詳情與班號資料。' : 'Use the route details and flight-number data below.'),
    searchResults,
    onSearchResultSelect: choose,
  };

  const copy = zh ? {
    searchPlaceholder: '搜尋機場、城市、航空公司、航線或班號，例如 TPE / Tokyo / BR / TPE-NRT / BR198',
    exploreTitle: '全球航網',
    exploreBody: '地圖先展示有來源的環球示例；搜尋機場可查看完整出發航網。完整航線與班號搜尋可按需載入。',
    previewNotice: '地圖目前顯示有來源的環球行程示例；機場詳情會載入該機場完整航線。搜尋未列出的航線或班號前，請先載入完整航網。',
    previewUnavailable: '來源示例目前無法載入；尚未搜尋完整航網，因此目前空白不代表沒有航線。可搜尋機場，或明確載入完整航網搜尋。',
    loadFullNetwork: '搜尋全部航線與班號',
    retryFullNetwork: '重試完整搜尋',
    loadingFullNetwork: '正在搜尋全部航線與班號…',
    routes: '方向航線', airports: '機場', airlines: '航空公司', confirmed: 'confirmed 班號航線',
    topHubs: '熱門樞紐', topAirlines: '大型航網', openAirport: '查看機場',
    outbound: '直飛目的地', countries: '國家／地區', inbound: '抵達方向航線',
    destinations: '目的地', routeMap: '航線地圖', airportNetwork: '機場航網',
    airlineNetwork: '航空公司航網', hubs: '主要樞紐', operating: '營運者確認航線', routeIndex: '航線列表', destinationIndex: '目的地列表',
    routeDetail: '航線詳情', distance: '大圓距離', operatingCarrier: '營運航空公司身份已核對', provider: '供應商列示的航線身份', unknownIdentity: '營運身份未知',
    confirmedNumbers: '一般班號參考', candidateNumbers: '候選班號', source: '資料來源', noNumber: '目前沒有一般班號參考',
    avinorDatedFlights: 'Avinor 日期班表列', avinorScheduledIdentity: 'Avinor 在所列日期以營運航空公司欄位列示此完整班號；時間為 UTC。',
    avinorScope: 'Avinor 在下列日期列出完全相符的 OperatingAirlineIata、完整 FlightId 與航線方向。空白 via_airport 只表示來源未列中停機場，不證明實際營運或實體直飛，也不代表固定班表、獎勵座位或可訂位。',
    avinorStale: 'Avinor 快照已過期；這些班號不再是目前有效的日期班表證據。',
    schedulePassed: '班表時間已過；未核對實際運航。', planDatedDeparture: '將此 OSL 出發日加入 Planner', planArrivalReference: '加入班號參考（不設定出發日期）',
    genericPlanDisabled: '一般 Planner 操作需要不受此日期快照限制的營運者身份。若有未來日期列，請使用上方該日期的班表項目。',
    planCarrier: '用這家航空公司加入 Planner', planFlight: '用這個班號加入 Planner', reverse: '查看反方向',
    back: '返回航網', noEntity: '目前沒有符合條件的航線。',
    airportLabel: '機場', airlineLabel: '航空公司', routeLabel: '航線',
    routeShardNotice: '已先載入這條航線；進入完整航網功能時才會載入全球航網。',
    airportShardNotice: '已完整載入此機場的出發航線；抵達方向統計需要完整全球航網。',
    airlineShardNotice: '已完整載入此航空公司的航網；跨航空公司的搜尋與詳細篩選才需要完整全球航網。',
    loadInbound: '補上抵達統計',
    loadGlobalSearch: '啟用完整搜尋',
  } : {
    searchPlaceholder: 'Search airport, city, airline, route or flight number — TPE / Tokyo / BR / TPE-NRT / BR198',
    exploreTitle: 'Global route network',
    exploreBody: 'The map starts with source-backed journey examples. Airport profiles load complete outbound routes; load the full catalog when you need any route or flight-number match.',
    previewNotice: 'The map currently shows source-backed journey examples; airport details load that airport’s complete route set. Load the full catalog before searching for routes or flight numbers outside these examples.',
    previewUnavailable: 'Sourced examples are temporarily unavailable. The complete network has not been searched, so an empty preview does not mean there are no routes. Search airports or explicitly load the full network.',
    loadFullNetwork: 'Search all routes and flight numbers',
    retryFullNetwork: 'Retry full search',
    loadingFullNetwork: 'Searching all routes and flight numbers…',
    routes: 'directional routes', airports: 'airports', airlines: 'airlines', confirmed: 'routes with confirmed numbers',
    topHubs: 'Popular hubs', topAirlines: 'Largest networks', openAirport: 'Open airport',
    outbound: 'nonstop destinations', countries: 'countries/regions', inbound: 'inbound directional routes',
    destinations: 'Destinations', routeMap: 'Route map', airportNetwork: 'Airport network',
    airlineNetwork: 'Airline network', hubs: 'Primary hubs', operating: 'operator-confirmed routes', routeIndex: 'Route list', destinationIndex: 'Destination list',
    routeDetail: 'Route detail', distance: 'great-circle distance', operatingCarrier: 'Operating carrier identity verified', provider: 'Provider-listed route identity', unknownIdentity: 'Operating identity unknown',
    confirmedNumbers: 'General flight-number references', candidateNumbers: 'Candidate flight numbers', source: 'Sources', noNumber: 'No general flight-number reference yet',
    avinorDatedFlights: 'Avinor dated schedule rows', avinorScheduledIdentity: 'Avinor lists this carrier as operating this full flight ID on the date shown; the time is UTC.',
    avinorScope: 'Avinor lists this exact OperatingAirlineIata, full FlightId and route direction for the dated rows below. A blank via_airport means this source reported no intermediate airport; it does not prove actual operation or physical nonstop service, recurring service, award seats or bookability.',
    avinorStale: 'The Avinor snapshot expired; these numbers are no longer current dated schedule evidence.',
    schedulePassed: 'Scheduled time passed; actual operation was not checked.', planDatedDeparture: 'Plan this OSL departure', planArrivalReference: 'Add flight-number reference (departure date not set)',
    genericPlanDisabled: 'The general Planner action needs a carrier identity that is not limited to this dated snapshot. Use a dated row above when available.',
    planCarrier: 'Use this airline in Planner', planFlight: 'Use this flight in Planner', reverse: 'View reverse route',
    back: 'Back to network', noEntity: 'No current route matches this selection.',
    airportLabel: 'Airport', airlineLabel: 'Airline', routeLabel: 'Route',
    routeShardNotice: 'This route loaded first; the full global network loads only when broader network features are needed.',
    airportShardNotice: 'All outbound routes for this airport are loaded; inbound statistics require the full global network.',
    airlineShardNotice: 'This airline’s complete network is loaded; cross-airline search and detailed filters require the full global network.',
    loadInbound: 'Load inbound statistics',
    loadGlobalSearch: 'Enable full search',
  };
  const homeStats: ReadonlyArray<RouteLibraryMapPreviewStat> = [];

  let entityContent: React.ReactNode = null;
  if (airportProfile) {
    const grouped = new Map<string, RouteLibraryRouteCard[]>();
    for (const route of airportProfile.outgoingRoutes) {
      const continent = routeLibraryEntityContinent(route.to, countryContinents, airportContinentOverrides);
      const bucket = grouped.get(continent) ?? [];
      bucket.push(route);
      grouped.set(continent, bucket);
    }
    const hubs = [{ airport: airportProfile.airport, connections: airportProfile.destinationCount }];
    const airportStats = [
      { value: airportProfile.destinationCount, label: copy.outbound },
      { value: airportProfile.airlineCount, label: copy.airlines },
      { value: airportProfile.countryCount, label: copy.countries },
      ...(networkComplete ? [{ value: airportProfile.incomingRouteCount, label: copy.inbound }] : []),
    ];
    entityContent = (
      <article className="entity-detail airport-entity">
        <header className="entity-detail-hero map-first-hero">
          <div><span>{copy.airportLabel}</span><h2><code>{airportProfile.airport.iata}</code> · {airportProfile.airport.city}</h2><p>{airportProfile.airport.name}</p></div>
        </header>
        <section className="entity-section map-primary-section"><Suspense fallback={<RouteMapLoading zh={zh} routes={airportProfile.outgoingRoutes} stats={airportStats} />}><LazyRouteEntityMap routes={airportProfile.outgoingRoutes} hubs={hubs} selectedAirport={airportProfile.airport} allianceTheme={alliance} controls={mapControls} loadingPreview={<RouteLibraryMapPreview embedded zh={zh} routes={airportProfile.outgoingRoutes} stats={airportStats} />} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} onRouteSelect={(id) => choose({ kind: 'route', id })} stats={airportStats} /></Suspense></section>
        {!networkComplete && <div className="entity-shard-notice entity-shard-notice--action" role="status"><span>{copy.airportShardNotice}</span>{onRequestFullNetwork && <button type="button" className="entity-inline-button" onClick={onRequestFullNetwork}>{copy.loadInbound}</button>}</div>}
        <details className="entity-secondary-index" open={showRouteIndex} onToggle={(event) => setShowRouteIndex(event.currentTarget.open)}>
          <summary>{copy.destinationIndex} · {airportProfile.destinationCount}</summary>
          {showRouteIndex && [...grouped.entries()].map(([continent, routes]) => (
            <section className="entity-section entity-destinations" key={continent}>
              <div className="entity-section-heading"><h3>{continentLabel(continent as ContinentId | 'unmapped')}</h3><span>{routes.length} {copy.destinations}</span></div>
              <div className="entity-route-grid">{routes.map((route) => <RouteCard key={routeId(route)} route={route} onSelect={choose} />)}</div>
            </section>
          ))}
        </details>
      </article>
    );
  } else if (airlineProfile) {
    const airlineStats = [
      { value: airlineProfile.routes.length, label: copy.routes },
      { value: airlineProfile.airportCount, label: copy.airports },
      { value: airlineProfile.countryCount, label: copy.countries },
      { value: airlineProfile.operatingRouteCount, label: copy.operating },
    ];
    entityContent = (
      <article className="entity-detail airline-entity">
        <header className="entity-detail-hero map-first-hero">
          <div><span>{copy.airlineLabel}</span><h2><code>{airlineProfile.carrier}</code> · {airlineProfile.name}</h2><p>{copy.airlineNetwork}</p></div>
        </header>
        <section className="entity-section map-primary-section"><Suspense fallback={<RouteMapLoading zh={zh} routes={airlineProfile.routes} stats={airlineStats} />}><LazyRouteEntityMap routes={airlineProfile.routes} hubs={airlineProfile.topHubs} allianceTheme={alliance} controls={mapControls} loadingPreview={<RouteLibraryMapPreview embedded zh={zh} routes={airlineProfile.routes} stats={airlineStats} />} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} onRouteSelect={(id) => choose({ kind: 'route', id })} stats={airlineStats} /></Suspense></section>
        {!networkComplete && <div className="entity-shard-notice entity-shard-notice--action" role="status"><span>{copy.airlineShardNotice}</span>{onRequestFullNetwork && <button type="button" className="entity-inline-button" onClick={onRequestFullNetwork}>{copy.loadGlobalSearch}</button>}</div>}
        <details className="entity-secondary-index" open={showRouteIndex} onToggle={(event) => setShowRouteIndex(event.currentTarget.open)}>
          <summary>{copy.routeIndex} · {airlineProfile.routes.length}</summary>
          {showRouteIndex && <div className="entity-route-grid">{airlineProfile.routes.map((route) => <RouteCard key={routeId(route)} route={route} onSelect={choose} compact />)}</div>}
        </details>
      </article>
    );
  } else if (routeProfile) {
    const route = routeProfile.route;
    const reverseId = `${route.to.iata}-${route.from.iata}`;
    const reverseExists = buildRouteEntityProfile(entityInput, reverseId) !== null;
    const routeStats = [
      { value: `${route.distanceNm.toLocaleString()} nm`, label: copy.distance },
      { value: route.carriers.length, label: copy.airlines },
      { value: route.carriers.filter((carrier) => carrier.confirmedNumbers.length > 0).length, label: copy.confirmed },
    ];
    entityContent = (
      <article className="entity-detail route-entity">
        <header className="entity-detail-hero route-detail-hero map-first-hero">
          <div><span>{copy.routeLabel}</span><h2><code>{route.from.iata}</code><b>→</b><code>{route.to.iata}</code></h2><p>{route.from.city} → {route.to.city}</p></div>
        </header>
        <section className="entity-section map-primary-section"><Suspense fallback={<RouteMapLoading zh={zh} routes={[route]} stats={routeStats} />}><LazyRouteEntityMap routes={[route]} hubs={[{ airport: route.from, connections: 1 }, { airport: route.to, connections: 1 }]} selectedRouteId={routeId(route)} allianceTheme={alliance} controls={mapControls} loadingPreview={<RouteLibraryMapPreview embedded zh={zh} routes={[route]} stats={routeStats} />} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} onRouteSelect={(id) => choose({ kind: 'route', id })} stats={routeStats} /></Suspense></section>
        {!networkComplete && <p className="entity-shard-notice" role="status">{copy.routeShardNotice}</p>}
        <section className="entity-section route-carrier-list"><div className="entity-section-heading"><h3>{copy.routeDetail}</h3>{(reverseExists || !networkComplete) && <button type="button" className="entity-inline-button" onClick={() => choose({ kind: 'route', id: reverseId })}>{copy.reverse}</button>}</div>
          {route.carriers.map((carrier) => (
            <article className="route-carrier-card" key={carrier.carrierEntityKey ?? carrier.carrier}>
              <header><div><code>{carrier.carrier}</code><strong>{carrier.name}</strong></div><span className={carrier.identity}>{carrier.identity === 'operating' ? copy.operatingCarrier : carrier.identity === 'provider-listed' ? copy.provider : copy.unknownIdentity}</span></header>
              <div className="route-carrier-numbers"><span>{copy.confirmedNumbers}</span>{carrier.confirmedNumbers.length > 0 ? <div>{carrier.confirmedNumbers.map((number) => <button type="button" key={number} disabled={carrier.identity !== 'operating' || Boolean(carrier.carrierEntityKey)} onClick={() => onPlanRoute({ from: route.from.iata, to: route.to.iata, carrier: carrier.carrier, flightNumber: number.slice(carrier.carrier.length) })}>{number}</button>)}</div> : <small>{copy.noNumber}</small>}</div>
              {carrier.candidateNumbers.length > 0 && <div className="route-carrier-candidates"><span>{copy.candidateNumbers}</span><div>{carrier.candidateNumbers.slice(0, 14).map((number) => <code key={number}>{number}</code>)}</div></div>}
              {carrier.datedFlightNumbers.length > 0 && <section className="route-carrier-dated-flights" aria-label={copy.avinorDatedFlights}>
                <h4>{copy.avinorDatedFlights}</h4>
                <ul>{carrier.datedFlightNumbers.map((evidence) => <li key={evidence.flightNumber}>
                  <strong><code>{evidence.flightNumber}</code></strong>
                  <small>{copy.avinorScheduledIdentity}</small>
                  <ul>{evidence.occurrencesUTC.map((occurrence) => {
                    const upcoming = Date.parse(occurrence) > evidenceNow && Date.parse(occurrence) < Date.parse(evidence.freshUntilUTC);
                    const localDepartureDate = route.from.iata === 'OSL' ? avinorOslDepartureDate(occurrence) : null;
                    return <li key={occurrence}>
                      <time dateTime={occurrence}>{occurrence.replace('T', ' ').replace('Z', ' UTC')}</time>
                      {upcoming && localDepartureDate
                        ? <button type="button" aria-label={`${copy.planDatedDeparture}: ${evidence.flightNumber} · ${localDepartureDate} · ${occurrence}`} onClick={() => onPlanRoute({ from: route.from.iata, to: route.to.iata, carrier: carrier.carrier, flightNumber: evidence.flightNumber.slice(carrier.carrier.length), departsOn: localDepartureDate })}>{copy.planDatedDeparture} · {localDepartureDate}</button>
                        : upcoming
                          ? <button type="button" aria-label={`${copy.planArrivalReference}: ${evidence.flightNumber} · ${occurrence}`} onClick={() => onPlanRoute({ from: route.from.iata, to: route.to.iata, carrier: carrier.carrier, flightNumber: evidence.flightNumber.slice(carrier.carrier.length) })}>{copy.planArrivalReference}</button>
                          : <small>{copy.schedulePassed}</small>}
                    </li>;
                  })}</ul>
                  <small>{zh ? '快照有效至（UTC）' : 'Snapshot valid until (UTC)'}: {evidence.freshUntilUTC}</small>
                </li>)}</ul>
              </section>}
              {carrier.sources.some(source => source.id === 'avinor-xml-public-osl-20261006') && <aside className="route-avinor-attribution"><a href="https://www.avinor.no/" target="_blank" rel="noreferrer">Flight data from Avinor</a> · <a href="https://partner.avinor.no/en/services/flight-data/" target="_blank" rel="noreferrer">{zh ? 'Avinor 航班資料條款' : 'Avinor flight-data terms'}</a><p>{copy.avinorScope}</p>{carrier.sources.find(source => source.id === 'avinor-xml-public-osl-20261006')?.freshUntilUTC && <small>{zh ? '快照有效至（UTC）' : 'Snapshot valid until (UTC)'}: {carrier.sources.find(source => source.id === 'avinor-xml-public-osl-20261006')!.freshUntilUTC}</small>}{carrier.staleNumbers.length > 0 && <p role="status">{copy.avinorStale} {carrier.staleNumbers.join(' · ')}</p>}</aside>}
              <div className="route-carrier-actions"><button type="button" disabled={carrier.identity !== 'operating' || Boolean(carrier.carrierEntityKey)} onClick={() => onPlanRoute({ from: route.from.iata, to: route.to.iata, carrier: carrier.carrier })}>{copy.planCarrier}</button>{(carrier.identity !== 'operating' || Boolean(carrier.carrierEntityKey)) && <small>{copy.genericPlanDisabled}</small>}</div>
              {carrier.sourcePairs.some(([from, to]) => from !== route.from.iata || to !== route.to.iata) && <p>{zh ? '原始來源代碼' : 'Original source codes'}: {carrier.sourcePairs.map(pair => pair.join(' → ')).join(', ')} · {[route.from.iata, route.to.iata].map(airportIdentityLabel).filter(Boolean).join(' · ')}</p>}
              <RegisteredPlansEvidence plans={carrier.registeredPlans} sources={carrier.sources} zh={zh} />

              <details><summary>{copy.source} · {carrier.sources.length}</summary><ul>{carrier.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.note}</a><span>{source.checkedOn}</span>{source.routeReviewWindow && <span>{zh ? '來源覆核窗（程式設定）' : 'Source review window (generated policy)'}: {source.routeReviewWindow.from} → {source.routeReviewWindow.until} · {sourceReviewStatusLabel(sourceReviewState(source.routeReviewWindow, evidenceNow), zh)} · {zh ? '這不是實際服務期間' : 'This is not service validity'}</span>}</li>)}</ul></details>
            </article>
          ))}
        </section>
      </article>
    );
  } else if (selection) {
    entityContent = <div className="entity-empty">{copy.noEntity}</div>;
  }

  return (
    <section className="route-library-entity-explorer">
      {selection && <div className="entity-breadcrumb"><button type="button" onClick={() => onSelect(null)}>← {copy.back}</button><span>{selection.kind === 'airport' ? copy.airportLabel : selection.kind === 'airline' ? copy.airlineLabel : copy.routeLabel}</span><strong>{selection.kind === 'airline' && airlineProfile ? `${airlineProfile.carrier} · ${airlineProfile.name}` : selection.kind === 'route' ? selection.id.replace('-', ' → ') : selection.id}</strong></div>}

      {!selection ? (
        <div className="entity-explore-home">
          <Suspense fallback={<RouteMapLoading zh={zh} routes={homeModel!.fingerprint.routes} stats={homeStats} />}><LazyRouteEntityMap routes={homeModel!.fingerprint.routes} hubs={homeModel!.fingerprint.hubs} allianceTheme={alliance} fingerprint controls={mapControls} loadingPreview={<RouteLibraryMapPreview embedded zh={zh} routes={homeModel!.fingerprint.routes} stats={homeStats} />} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} onRouteSelect={(id) => choose({ kind: 'route', id })} stats={homeStats} /></Suspense>
          {!networkComplete && onRequestFullNetwork && <div className="entity-shard-notice entity-shard-notice--action global-map-preview-notice" role="status"><span>{routeMapPreview ? copy.previewNotice : copy.previewUnavailable}</span><button type="button" className="entity-inline-button" onClick={fullNetworkError ? onRetryFullNetwork : onRequestFullNetwork} disabled={fullNetworkLoading}>{fullNetworkLoading ? copy.loadingFullNetwork : fullNetworkError ? copy.retryFullNetwork : copy.loadFullNetwork}</button></div>}
        </div>
      ) : entityContent}
      {selection?.kind==='route' && <OfficialRouteReferences pair={selection.id} zh={zh}/>}
      {selection?.kind==='route' && <CaliPrimaryReferences pair={selection.id} zh={zh}/>}
      {selection?.kind==='route' && (() => {
        const [from, to] = selection.id.split('-');
        return from && to ? <CaaWeeklyScheduleRouteEvidence from={from} to={to} /> : null;
      })()}
      {caaReferences.shard && <section className="entity-section caa-route-references" data-caa-pair={caaReferences.shard.pair.join('-')}>
        <h3>{zh ? '此方向的 CAA 發布時刻參考' : 'CAA published timetable references for this direction'} · {caaReferences.shard.pair.join(' → ')}</h3>
        <p>{zh ? '這是獨立唯讀參考，包含非聯盟會員列示；不會增加聯盟航線、可用航空公司或選班選項。' : 'This independent read-only reference includes non-member listings. It adds no alliance route, eligible carrier or flight-selection option.'}</p>
        {[...new Set(caaReferences.shard.records.map(row => row.listedAirlineCode))].sort().map(carrier => <article className="caa-reference-carrier" data-caa-carrier={carrier} key={`${caaReferences.shard!.pair.join('-')}-${carrier}`}><h4>{carrier}</h4><CaaPublishedTimetableEvidence shard={caaReferences.shard!} carrier={carrier} from={caaReferences.shard!.pair[0]} to={caaReferences.shard!.pair[1]} zh={zh} /></article>)}
      </section>}
      {caaReferences.status === 'failed' && <p>{zh ? 'CAA 時刻表參考暫無法讀取；請核對來源。' : 'CAA timetable references are unavailable; check the source.'}</p>}
    </section>
  );
}
