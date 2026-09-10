import { lazy, Suspense, useMemo, useState } from 'react';
import type { ContinentId } from '../lib/schemas/country-continent.ts';
import type { RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { Airport } from '../lib/types.ts';
import { buildRouteLibraryOverview } from '../lib/rtw/route-library-overview.ts';
import {
  buildAirportEntityProfile,
  buildAirlineEntityProfile,
  buildRouteLibraryFingerprint,
  buildRouteEntityProfile,
  routeLibraryEntityContinent,
  searchRouteLibraryEntities,
  type RouteLibraryEntitySelection,
  type RouteLibraryRouteCard,
} from '../lib/rtw/route-library-entities.ts';
import { useLocale } from '../i18n/use-locale.ts';
import type { RouteMapAllianceTheme } from './RouteLibraryMap.tsx';
import './RouteLibraryExplorer.css';

const LazyRouteEntityMap = lazy(() =>
  import('./RouteLibraryMap.tsx').then((module) => ({ default: module.RouteEntityMap })),
);

function RouteMapLoading({ zh }: { readonly zh: boolean }): React.ReactElement {
  return (
    <div className="entity-map-card maplibre-route-map entity-map-loading" role="status">
      <span>{zh ? '正在載入互動航線地圖…' : 'Loading interactive route map…'}</span>
    </div>
  );
}

interface PlanRouteInput {
  readonly from: string;
  readonly to: string;
  readonly carrier: string;
  readonly flightNumber?: string | undefined;
}

interface Props {
  readonly network: RouteNetworkCatalog;
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
      <small>{route.carriers.map((carrier) => carrier.carrier).join(' · ')} · {route.distanceNm.toLocaleString()} nm</small>
      {numbers.length > 0 && <span className="entity-route-number-preview">{numbers.join(' · ')}</span>}
    </button>
  );
}

export function RouteLibraryExplorer({
  network,
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
}: Props): React.ReactElement {
  const { locale, t } = useLocale();
  const zh = locale === 'zh-TW';
  const [searchOpen, setSearchOpen] = useState(false);
  const [showRouteIndex, setShowRouteIndex] = useState(false);
  const entityInput = useMemo(() => ({ network, airports, carrierNames, memberCodes }), [network, airports, carrierNames, memberCodes]);
  const searchResults = useMemo(() => searchRouteLibraryEntities({ ...entityInput, query, locale: zh ? 'zh-TW' : 'en' }), [entityInput, query, zh]);
  const homeModel = useMemo(() => {
    if (selection) return null;
    return {
      overview: buildRouteLibraryOverview({
        network,
        memberCodes,
        airports,
        carrierNames,
        countryContinents,
        airportContinentOverrides,
      }),
      fingerprint: buildRouteLibraryFingerprint(entityInput, alliance === 'all' ? 150 : 120),
    };
  }, [selection, network, memberCodes, airports, carrierNames, countryContinents, airportContinentOverrides, entityInput, alliance]);
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
    searchResults,
    onSearchResultSelect: choose,
  };

  const copy = zh ? {
    searchPlaceholder: '搜尋機場、城市、航空公司、航線或班號，例如 TPE / Tokyo / BR / TPE-NRT / BR198',
    exploreTitle: '全球航網',
    exploreBody: '機場、航空公司、航線與班號，都可以直接從地圖探索。',
    routes: '方向航線', airports: '機場', airlines: '航空公司', confirmed: 'confirmed 班號航線',
    topHubs: '熱門樞紐', topAirlines: '大型航網', openAirport: '查看機場',
    outbound: '直飛目的地', countries: '國家／地區', inbound: '抵達方向航線',
    destinations: '目的地', routeMap: '航線地圖', airportNetwork: '機場航網',
    airlineNetwork: '航空公司航網', hubs: '主要樞紐', operating: '營運者確認航線', routeIndex: '航線列表', destinationIndex: '目的地列表',
    routeDetail: '航線詳情', distance: '大圓距離', operatingCarrier: '已確認營運者', provider: '供應商列示',
    confirmedNumbers: '已確認班號', candidateNumbers: '候選班號', source: '資料來源', noNumber: '尚未確認班號',
    planCarrier: '用這家航空公司加入 Planner', planFlight: '用這個班號加入 Planner', reverse: '查看反方向',
    back: '返回航網', noEntity: '目前沒有符合條件的航線。',
    airportLabel: '機場', airlineLabel: '航空公司', routeLabel: '航線',
  } : {
    searchPlaceholder: 'Search airport, city, airline, route or flight number — TPE / Tokyo / BR / TPE-NRT / BR198',
    exploreTitle: 'Global route network',
    exploreBody: 'Explore airports, airlines, routes and flight numbers directly on the map.',
    routes: 'directional routes', airports: 'airports', airlines: 'airlines', confirmed: 'routes with confirmed numbers',
    topHubs: 'Popular hubs', topAirlines: 'Largest networks', openAirport: 'Open airport',
    outbound: 'nonstop destinations', countries: 'countries/regions', inbound: 'inbound directional routes',
    destinations: 'Destinations', routeMap: 'Route map', airportNetwork: 'Airport network',
    airlineNetwork: 'Airline network', hubs: 'Primary hubs', operating: 'operator-confirmed routes', routeIndex: 'Route list', destinationIndex: 'Destination list',
    routeDetail: 'Route detail', distance: 'great-circle distance', operatingCarrier: 'Operating carrier confirmed', provider: 'Provider-listed',
    confirmedNumbers: 'Confirmed flight numbers', candidateNumbers: 'Candidate flight numbers', source: 'Sources', noNumber: 'No confirmed flight number yet',
    planCarrier: 'Use this airline in Planner', planFlight: 'Use this flight in Planner', reverse: 'View reverse route',
    back: 'Back to network', noEntity: 'No current route matches this selection.',
    airportLabel: 'Airport', airlineLabel: 'Airline', routeLabel: 'Route',
  };

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
    entityContent = (
      <article className="entity-detail airport-entity">
        <header className="entity-detail-hero map-first-hero">
          <div><span>{copy.airportLabel}</span><h2><code>{airportProfile.airport.iata}</code> · {airportProfile.airport.city}</h2><p>{airportProfile.airport.name}</p></div>
        </header>
        <section className="entity-section map-primary-section"><Suspense fallback={<RouteMapLoading zh={zh} />}><LazyRouteEntityMap routes={airportProfile.outgoingRoutes} hubs={hubs} selectedAirport={airportProfile.airport} allianceTheme={alliance} controls={mapControls} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} onRouteSelect={(id) => choose({ kind: 'route', id })} stats={[{ value: airportProfile.destinationCount, label: copy.outbound }, { value: airportProfile.airlineCount, label: copy.airlines }, { value: airportProfile.countryCount, label: copy.countries }, { value: airportProfile.incomingRouteCount, label: copy.inbound }]} /></Suspense></section>
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
    entityContent = (
      <article className="entity-detail airline-entity">
        <header className="entity-detail-hero map-first-hero">
          <div><span>{copy.airlineLabel}</span><h2><code>{airlineProfile.carrier}</code> · {airlineProfile.name}</h2><p>{copy.airlineNetwork}</p></div>
        </header>
        <section className="entity-section map-primary-section"><Suspense fallback={<RouteMapLoading zh={zh} />}><LazyRouteEntityMap routes={airlineProfile.routes} hubs={airlineProfile.topHubs} allianceTheme={alliance} controls={mapControls} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} onRouteSelect={(id) => choose({ kind: 'route', id })} stats={[{ value: airlineProfile.routes.length, label: copy.routes }, { value: airlineProfile.airportCount, label: copy.airports }, { value: airlineProfile.countryCount, label: copy.countries }, { value: airlineProfile.operatingRouteCount, label: copy.operating }]} /></Suspense></section>
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
    entityContent = (
      <article className="entity-detail route-entity">
        <header className="entity-detail-hero route-detail-hero map-first-hero">
          <div><span>{copy.routeLabel}</span><h2><code>{route.from.iata}</code><b>→</b><code>{route.to.iata}</code></h2><p>{route.from.city} → {route.to.city}</p></div>
        </header>
        <section className="entity-section map-primary-section"><Suspense fallback={<RouteMapLoading zh={zh} />}><LazyRouteEntityMap routes={[route]} hubs={[{ airport: route.from, connections: 1 }, { airport: route.to, connections: 1 }]} selectedRouteId={routeId(route)} allianceTheme={alliance} controls={mapControls} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} onRouteSelect={(id) => choose({ kind: 'route', id })} stats={[{ value: `${route.distanceNm.toLocaleString()} nm`, label: copy.distance }, { value: route.carriers.length, label: copy.airlines }, { value: route.carriers.filter((carrier) => carrier.confirmedNumbers.length > 0).length, label: copy.confirmed }]} /></Suspense></section>
        <section className="entity-section route-carrier-list"><div className="entity-section-heading"><h3>{copy.routeDetail}</h3>{reverseExists && <button type="button" className="entity-inline-button" onClick={() => choose({ kind: 'route', id: reverseId })}>{copy.reverse}</button>}</div>
          {route.carriers.map((carrier) => (
            <article className="route-carrier-card" key={carrier.carrier}>
              <header><div><code>{carrier.carrier}</code><strong>{carrier.name}</strong></div><span className={carrier.identity}>{carrier.identity === 'operating' ? copy.operatingCarrier : copy.provider}</span></header>
              <div className="route-carrier-numbers"><span>{copy.confirmedNumbers}</span>{carrier.confirmedNumbers.length > 0 ? <div>{carrier.confirmedNumbers.map((number) => <button type="button" key={number} disabled={carrier.identity !== 'operating'} onClick={() => onPlanRoute({ from: route.from.iata, to: route.to.iata, carrier: carrier.carrier, flightNumber: number.slice(carrier.carrier.length) })}>{number}</button>)}</div> : <small>{copy.noNumber}</small>}</div>
              {carrier.candidateNumbers.length > 0 && <div className="route-carrier-candidates"><span>{copy.candidateNumbers}</span><div>{carrier.candidateNumbers.slice(0, 14).map((number) => <code key={number}>{number}</code>)}</div></div>}
              <div className="route-carrier-actions"><button type="button" disabled={carrier.identity !== 'operating'} onClick={() => onPlanRoute({ from: route.from.iata, to: route.to.iata, carrier: carrier.carrier })}>{copy.planCarrier}</button></div>
              <details><summary>{copy.source} · {carrier.sources.length}</summary><ul>{carrier.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.note}</a><span>{source.checkedOn}</span></li>)}</ul></details>
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
      {selection && <div className="entity-breadcrumb"><button type="button" onClick={() => onSelect(null)}>← {copy.back}</button><span>{selection.kind === 'airport' ? copy.airportLabel : selection.kind === 'airline' ? copy.airlineLabel : copy.routeLabel}</span><strong>{selection.id.replace('-', ' → ')}</strong></div>}

      {!selection ? (
        <div className="entity-explore-home">
          <Suspense fallback={<RouteMapLoading zh={zh} />}><LazyRouteEntityMap routes={homeModel!.fingerprint.routes} hubs={homeModel!.fingerprint.hubs} allianceTheme={alliance} fingerprint controls={mapControls} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} onRouteSelect={(id) => choose({ kind: 'route', id })} stats={[{ value: homeModel!.overview.routeCount, label: copy.routes }, { value: homeModel!.overview.airportCount, label: copy.airports }, { value: homeModel!.overview.carrierCount, label: copy.airlines }, { value: homeModel!.overview.confirmedNumberCount, label: copy.confirmed }]} /></Suspense>
        </div>
      ) : entityContent}
    </section>
  );
}
