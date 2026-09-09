import { useMemo, useState } from 'react';
import { geoEqualEarth, geoPath } from 'd3-geo';
import type { LineString } from 'geojson';
import { greatCirclePath } from '../lib/calc/haversine.ts';
import type { ContinentId } from '../lib/schemas/country-continent.ts';
import type { RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { Airport } from '../lib/types.ts';
import { buildRouteLibraryOverview } from '../lib/rtw/route-library-overview.ts';
import {
  buildAirportEntityProfile,
  buildAirlineEntityProfile,
  buildRouteEntityProfile,
  routeLibraryEntityContinent,
  searchRouteLibraryEntities,
  type RouteLibraryEntitySelection,
  type RouteLibraryRouteCard,
} from '../lib/rtw/route-library-entities.ts';
import { useWorldMap } from '../state/use-world-map.ts';
import { useLocale } from '../i18n/use-locale.ts';
import './RouteLibraryExplorer.css';

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
}

const MAP_W = 1200;
const MAP_H = 560;

function routeId(route: RouteLibraryRouteCard): string {
  return `${route.from.iata}-${route.to.iata}`;
}

function RouteEntityMap({
  routes,
  hubs,
  selectedAirport,
  onAirportSelect,
}: {
  readonly routes: ReadonlyArray<RouteLibraryRouteCard>;
  readonly hubs: ReadonlyArray<{ readonly airport: Airport; readonly connections: number }>;
  readonly selectedAirport?: Airport | undefined;
  readonly onAirportSelect: (airport: Airport) => void;
}): React.ReactElement {
  const { features } = useWorldMap();
  const projection = useMemo(() => geoEqualEarth().scale(198).translate([MAP_W / 2, MAP_H / 2 + 8]), []);
  const path = useMemo(() => geoPath(projection), [projection]);
  const worldPath = features ? path(features) ?? '' : '';
  const routePaths = useMemo(() => routes.slice(0, 320).map((route) => {
    const line: LineString = {
      type: 'LineString',
      coordinates: greatCirclePath(route.from, route.to, 36).map((point) => [point.lon, point.lat]),
    };
    return { id: routeId(route), d: path(line) ?? '' };
  }).filter((row) => row.d), [routes, path]);
  const maxConnections = Math.max(1, ...hubs.map((hub) => hub.connections));
  const hubPoints = hubs.map((hub) => {
    const point = projection([hub.airport.lon, hub.airport.lat]);
    return point ? { ...hub, x: point[0], y: point[1] } : null;
  }).filter((hub): hub is NonNullable<typeof hub> => hub !== null);

  return (
    <div className="entity-map-card">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="Route network map">
        {worldPath && <path className="entity-map-world" d={worldPath} />}
        <g className="entity-map-routes">{routePaths.map((route) => <path key={route.id} d={route.d} />)}</g>
        <g className="entity-map-hubs">
          {hubPoints.map((hub) => (
            <g key={hub.airport.iata} transform={`translate(${hub.x} ${hub.y})`} onClick={() => onAirportSelect(hub.airport)}>
              <circle r={4 + (hub.connections / maxConnections) * 8} />
              <text x="10" y="4">{hub.airport.iata}</text>
            </g>
          ))}
          {selectedAirport && (() => {
            const point = projection([selectedAirport.lon, selectedAirport.lat]);
            return point ? <circle className="entity-map-selected" cx={point[0]} cy={point[1]} r="10" /> : null;
          })()}
        </g>
      </svg>
    </div>
  );
}

function Metric({ value, label }: { readonly value: string | number; readonly label: string }): React.ReactElement {
  return <div className="entity-metric"><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong><span>{label}</span></div>;
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
}: Props): React.ReactElement {
  const { locale, t } = useLocale();
  const zh = locale === 'zh-TW';
  const [query, setQuery] = useState('');
  const [showAllAirlineRoutes, setShowAllAirlineRoutes] = useState(false);
  const entityInput = useMemo(() => ({ network, airports, carrierNames, memberCodes }), [network, airports, carrierNames, memberCodes]);
  const searchResults = useMemo(() => searchRouteLibraryEntities({ ...entityInput, query, locale: zh ? 'zh-TW' : 'en' }), [entityInput, query, zh]);
  const overview = useMemo(() => buildRouteLibraryOverview({
    network,
    memberCodes,
    airports,
    carrierNames,
    countryContinents,
    airportContinentOverrides,
  }), [network, memberCodes, airports, carrierNames, countryContinents, airportContinentOverrides]);

  const airportProfile = selection?.kind === 'airport' ? buildAirportEntityProfile(entityInput, selection.id) : null;
  const airlineProfile = selection?.kind === 'airline' ? buildAirlineEntityProfile(entityInput, selection.id) : null;
  const routeProfile = selection?.kind === 'route' ? buildRouteEntityProfile(entityInput, selection.id) : null;

  const continentLabel = (continent: ContinentId | 'unmapped'): string => continent === 'unmapped'
    ? (zh ? '未分類' : 'Unmapped')
    : t(`rtw.continent.${continent}`);
  const topHubPoints = overview.topHubs.slice(0, 10).map((hub) => ({ airport: airports.get(hub.iata), connections: hub.connections }))
    .filter((row): row is { airport: Airport; connections: number } => row.airport !== undefined);

  const choose = (next: RouteLibraryEntitySelection): void => {
    setQuery('');
    setShowAllAirlineRoutes(false);
    onSelect(next);
  };

  const copy = zh ? {
    searchPlaceholder: '搜尋機場、城市、航空公司、航線或班號，例如 TPE / Tokyo / BR / TPE-NRT / BR198',
    exploreTitle: '從一個機場開始，看世界怎麼連在一起。',
    exploreBody: '先搜尋一個機場、航空公司或班號。沒有選取時，地圖只標示主要樞紐；選定實體後才展開真正相關的航線。',
    routes: '方向航線', airports: '機場', airlines: '航空公司', confirmed: 'confirmed 班號航線',
    topHubs: '熱門樞紐', topAirlines: '大型航網', openAirport: '查看機場',
    outbound: '直飛目的地', countries: '國家／地區', inbound: '抵達方向航線',
    destinations: '目的地', routeMap: '航線地圖', airportNetwork: '機場航網',
    airlineNetwork: '航空公司航網', hubs: '主要樞紐', operating: '營運者確認航線', showAll: '顯示全部航線', showLess: '收起航線',
    routeDetail: '航線詳情', distance: '大圓距離', operatingCarrier: '已確認營運者', provider: '供應商列示',
    confirmedNumbers: '已確認班號', candidateNumbers: '候選班號', source: '資料來源', noNumber: '尚未確認班號',
    planCarrier: '用這家航空公司加入 Planner', planFlight: '用這個班號加入 Planner', reverse: '查看反方向',
    back: '返回 Explore', noEntity: '這個條件目前沒有 published 航線。', advanced: '需要更細的 evidence 篩選？可使用下方進階查證工具。',
  } : {
    searchPlaceholder: 'Search airport, city, airline, route or flight number — TPE / Tokyo / BR / TPE-NRT / BR198',
    exploreTitle: 'Start with one airport. See how the world connects.',
    exploreBody: 'Search an airport, airline or flight number. With nothing selected, the map stays quiet and shows only major hubs; selecting an entity reveals only the routes that matter.',
    routes: 'directional routes', airports: 'airports', airlines: 'airlines', confirmed: 'routes with confirmed numbers',
    topHubs: 'Popular hubs', topAirlines: 'Largest networks', openAirport: 'Open airport',
    outbound: 'nonstop destinations', countries: 'countries/regions', inbound: 'inbound directional routes',
    destinations: 'Destinations', routeMap: 'Route map', airportNetwork: 'Airport network',
    airlineNetwork: 'Airline network', hubs: 'Primary hubs', operating: 'operator-confirmed routes', showAll: 'Show all routes', showLess: 'Show fewer routes',
    routeDetail: 'Route detail', distance: 'great-circle distance', operatingCarrier: 'Operating carrier confirmed', provider: 'Provider-listed',
    confirmedNumbers: 'Confirmed flight numbers', candidateNumbers: 'Candidate flight numbers', source: 'Sources', noNumber: 'No confirmed flight number yet',
    planCarrier: 'Use this airline in Planner', planFlight: 'Use this flight in Planner', reverse: 'View reverse route',
    back: 'Back to Explore', noEntity: 'No published route matches this entity.', advanced: 'Need deeper evidence filters? Use the advanced verification browser below.',
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
        <header className="entity-detail-hero">
          <div><span>AIRPORT</span><h2><code>{airportProfile.airport.iata}</code> · {airportProfile.airport.city}</h2><p>{airportProfile.airport.name}</p></div>
          <div className="entity-detail-metrics">
            <Metric value={airportProfile.destinationCount} label={copy.outbound} />
            <Metric value={airportProfile.airlineCount} label={copy.airlines} />
            <Metric value={airportProfile.countryCount} label={copy.countries} />
            <Metric value={airportProfile.incomingRouteCount} label={copy.inbound} />
          </div>
        </header>
        <section className="entity-section"><h3>{copy.airportNetwork}</h3><RouteEntityMap routes={airportProfile.outgoingRoutes} hubs={hubs} selectedAirport={airportProfile.airport} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} /></section>
        {[...grouped.entries()].map(([continent, routes]) => (
          <section className="entity-section entity-destinations" key={continent}>
            <div className="entity-section-heading"><h3>{continentLabel(continent as ContinentId | 'unmapped')}</h3><span>{routes.length} {copy.destinations}</span></div>
            <div className="entity-route-grid">{routes.map((route) => <RouteCard key={routeId(route)} route={route} onSelect={choose} />)}</div>
          </section>
        ))}
      </article>
    );
  } else if (airlineProfile) {
    const displayRoutes = showAllAirlineRoutes ? airlineProfile.routes : airlineProfile.routes.slice(0, 36);
    entityContent = (
      <article className="entity-detail airline-entity">
        <header className="entity-detail-hero">
          <div><span>AIRLINE</span><h2><code>{airlineProfile.carrier}</code> · {airlineProfile.name}</h2><p>{copy.airlineNetwork}</p></div>
          <div className="entity-detail-metrics">
            <Metric value={airlineProfile.routes.length} label={copy.routes} />
            <Metric value={airlineProfile.airportCount} label={copy.airports} />
            <Metric value={airlineProfile.countryCount} label={copy.countries} />
            <Metric value={airlineProfile.operatingRouteCount} label={copy.operating} />
          </div>
        </header>
        <section className="entity-section"><h3>{copy.airlineNetwork}</h3><RouteEntityMap routes={airlineProfile.routes} hubs={airlineProfile.topHubs} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} /></section>
        <section className="entity-section entity-hubs"><h3>{copy.hubs}</h3><div className="entity-hub-strip">{airlineProfile.topHubs.map((hub) => <button type="button" key={hub.airport.iata} onClick={() => choose({ kind: 'airport', id: hub.airport.iata })}><code>{hub.airport.iata}</code><strong>{hub.airport.city}</strong><span>{hub.connections}</span></button>)}</div></section>
        <section className="entity-section"><div className="entity-section-heading"><h3>{copy.routes}</h3><span>{airlineProfile.routes.length}</span></div><div className="entity-route-grid">{displayRoutes.map((route) => <RouteCard key={routeId(route)} route={route} onSelect={choose} compact />)}</div>{airlineProfile.routes.length > 36 && <button type="button" className="entity-more-button" onClick={() => setShowAllAirlineRoutes((value) => !value)}>{showAllAirlineRoutes ? copy.showLess : copy.showAll}</button>}</section>
      </article>
    );
  } else if (routeProfile) {
    const route = routeProfile.route;
    const reverseId = `${route.to.iata}-${route.from.iata}`;
    const reverseExists = buildRouteEntityProfile(entityInput, reverseId) !== null;
    entityContent = (
      <article className="entity-detail route-entity">
        <header className="entity-detail-hero route-detail-hero">
          <div><span>ROUTE</span><h2><code>{route.from.iata}</code><b>→</b><code>{route.to.iata}</code></h2><p>{route.from.city} → {route.to.city}</p></div>
          <div className="entity-detail-metrics"><Metric value={`${route.distanceNm.toLocaleString()} nm`} label={copy.distance} /><Metric value={route.carriers.length} label={copy.airlines} /><Metric value={route.carriers.filter((carrier) => carrier.confirmedNumbers.length > 0).length} label={copy.confirmed} /></div>
        </header>
        <section className="entity-section"><RouteEntityMap routes={[route]} hubs={[{ airport: route.from, connections: 1 }, { airport: route.to, connections: 1 }]} selectedAirport={route.from} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} /></section>
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
      <div className="entity-search-shell">
        <div className="entity-search-copy"><span>EXPLORE</span><h2>{copy.exploreTitle}</h2><p>{copy.exploreBody}</p></div>
        <label className="entity-search-box"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.searchPlaceholder} />{query && <button type="button" onClick={() => setQuery('')}>×</button>}</label>
        {query && <div className="entity-search-results" role="listbox">{searchResults.length > 0 ? searchResults.map((result) => <button type="button" role="option" key={result.key} onClick={() => choose(result.selection)}><span>{result.kind}</span><strong>{result.title}</strong><small>{result.subtitle}</small></button>) : <p>{copy.noEntity}</p>}</div>}
      </div>

      {selection && <div className="entity-breadcrumb"><button type="button" onClick={() => onSelect(null)}>← {copy.back}</button><span>{selection.kind}</span><strong>{selection.id.replace('-', ' → ')}</strong></div>}

      {!selection ? (
        <div className="entity-explore-home">
          <RouteEntityMap routes={[]} hubs={topHubPoints} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} />
          <div className="entity-explore-stats"><Metric value={overview.routeCount} label={copy.routes} /><Metric value={overview.airportCount} label={copy.airports} /><Metric value={overview.carrierCount} label={copy.airlines} /><Metric value={overview.confirmedNumberCount} label={copy.confirmed} /></div>
          <div className="entity-explore-lists">
            <section><h3>{copy.topHubs}</h3>{overview.topHubs.slice(0, 10).map((hub) => <button type="button" key={hub.iata} onClick={() => choose({ kind: 'airport', id: hub.iata })}><code>{hub.iata}</code><strong>{hub.city}</strong><span>{hub.connections}</span></button>)}</section>
            <section><h3>{copy.topAirlines}</h3>{overview.topCarriers.slice(0, 10).map((carrier) => <button type="button" key={carrier.carrier} onClick={() => choose({ kind: 'airline', id: carrier.carrier })}><code>{carrier.carrier}</code><strong>{carrier.name}</strong><span>{carrier.routes.toLocaleString()}</span></button>)}</section>
          </div>
        </div>
      ) : entityContent}
      <p className="entity-advanced-note">{copy.advanced}</p>
    </section>
  );
}
