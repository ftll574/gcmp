import { useMemo } from 'react';
import { geoEqualEarth, geoPath } from 'd3-geo';
import type { LineString } from 'geojson';
import { greatCirclePath } from '../lib/calc/haversine.ts';
import type { ContinentId } from '../lib/schemas/country-continent.ts';
import type { RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { Airport } from '../lib/types.ts';
import { buildRouteLibraryOverview, type RouteLibraryContinent } from '../lib/rtw/route-library-overview.ts';
import { useLocale } from '../i18n/use-locale.ts';
import { useWorldMap } from '../state/use-world-map.ts';
import './RouteNetworkOverview.css';

type AllianceView = 'all' | 'star' | 'oneworld' | 'skyteam';

interface Props {
  readonly alliance: AllianceView;
  readonly network: RouteNetworkCatalog;
  readonly memberCodes: ReadonlySet<string>;
  readonly airports: ReadonlyMap<string, Airport>;
  readonly carrierNames: ReadonlyMap<string, string>;
  readonly countryContinents?: ReadonlyMap<string, ContinentId> | null | undefined;
  readonly airportContinentOverrides?: ReadonlyMap<string, ContinentId> | null | undefined;
  readonly onCarrierSelect: (carrier: string) => void;
}

const WIDTH = 1100;
const HEIGHT = 520;

export function RouteNetworkOverview({
  alliance,
  network,
  memberCodes,
  airports,
  carrierNames,
  countryContinents,
  airportContinentOverrides,
  onCarrierSelect,
}: Props): React.ReactElement {
  const { locale, t } = useLocale();
  const { features } = useWorldMap();
  const model = useMemo(() => buildRouteLibraryOverview({
    network,
    memberCodes,
    airports,
    carrierNames,
    countryContinents,
    airportContinentOverrides,
  }), [network, memberCodes, airports, carrierNames, countryContinents, airportContinentOverrides]);
  const projection = useMemo(() => geoEqualEarth().scale(182).translate([WIDTH / 2, HEIGHT / 2 + 8]), []);
  const path = useMemo(() => geoPath(projection), [projection]);
  const worldPath = features ? path(features) ?? '' : '';
  const routePaths = useMemo(() => model.representativeRoutes.map((route) => {
    const line: LineString = {
      type: 'LineString',
      coordinates: greatCirclePath(route.from, route.to, 28).map((point) => [point.lon, point.lat]),
    };
    return { key: `${route.from.iata}-${route.to.iata}`, d: path(line) ?? '' };
  }).filter((route) => route.d !== ''), [model.representativeRoutes, path]);
  const hubPoints = useMemo(() => model.topHubs.map((hub) => {
    const airport = airports.get(hub.iata);
    const point = airport ? projection([airport.lon, airport.lat]) : null;
    return point ? { ...hub, x: point[0], y: point[1] } : null;
  }).filter((hub): hub is NonNullable<typeof hub> => hub !== null), [model.topHubs, airports, projection]);

  const zh = locale === 'zh-TW';
  const copy = zh ? {
    eyebrow: 'NETWORK OVERVIEW', title: '先看航網長什麼樣，再查一條航線。',
    map: '目前航網密度', mapNote: '顯示目前篩選聯盟中，樞紐度最高的一組代表航線。線條是航網視覺，不代表即時班次頻率。',
    routes: '方向航線', airports: '機場', carriers: '航空公司', confirmed: '有 confirmed 班號',
    identity: '營運者確認度', flightIdentity: '班號確認度', topCarriers: '航網最大的航空公司', topHubs: '最密集的樞紐',
    departures: '出發航線分布', explore: '用這家航空公司往下查',
  } : {
    eyebrow: 'NETWORK OVERVIEW', title: 'See the network first. Then inspect a route.',
    map: 'Current network density', mapNote: 'A representative set of high-connectivity routes for the selected alliance. Lines show network structure, not live frequency.',
    routes: 'directional routes', airports: 'airports', carriers: 'airlines', confirmed: 'with confirmed numbers',
    identity: 'operator identity', flightIdentity: 'flight-number identity', topCarriers: 'Largest airline networks', topHubs: 'Most connected hubs',
    departures: 'Origin distribution', explore: 'Explore this airline',
  };
  const operatingPct = model.routeCount ? Math.round((model.operatingCount / model.routeCount) * 100) : 0;
  const confirmedPct = model.routeCount ? Math.round((model.confirmedNumberCount / model.routeCount) * 100) : 0;
  const maxCarrier = model.topCarriers[0]?.routes ?? 1;
  const maxHub = model.topHubs[0]?.connections ?? 1;
  const maxContinent = Math.max(1, ...model.continents.map((row) => row.routes));

  const continentLabel = (continent: RouteLibraryContinent): string => continent === 'unmapped'
    ? (zh ? '未分類' : 'Unmapped')
    : t(`rtw.continent.${continent}`);

  return (
    <section className={`route-network-overview alliance-${alliance}`} aria-label={zh ? '航網總覽' : 'Network overview'}>
      <header className="route-overview-heading">
        <span>{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
      </header>

      <div className="route-overview-visual-grid">
        <div className="route-overview-map-card">
          <div className="route-overview-map-copy"><strong>{copy.map}</strong><span>{copy.mapNote}</span></div>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={copy.map}>
            {worldPath && <path className="route-overview-world" d={worldPath} />}
            <g className="route-overview-lines">
              {routePaths.map((route) => <path key={route.key} d={route.d} />)}
            </g>
            <g className="route-overview-hub-dots">
              {hubPoints.map((hub) => (
                <circle key={hub.iata} cx={hub.x} cy={hub.y} r={3.5 + (hub.connections / maxHub) * 5.5}>
                  <title>{hub.iata} · {hub.city} · {hub.connections}</title>
                </circle>
              ))}
            </g>
          </svg>
        </div>

        <aside className="route-overview-metrics-card">
          <div className="route-overview-big-number"><strong>{model.routeCount.toLocaleString()}</strong><span>{copy.routes}</span></div>
          <div className="route-overview-mini-metrics">
            <div><strong>{model.airportCount.toLocaleString()}</strong><span>{copy.airports}</span></div>
            <div><strong>{model.carrierCount}</strong><span>{copy.carriers}</span></div>
            <div><strong>{model.confirmedNumberCount.toLocaleString()}</strong><span>{copy.confirmed}</span></div>
          </div>
          <div className="route-overview-confidence">
            <div><div><span>{copy.identity}</span><strong>{operatingPct}%</strong></div><i><b style={{ width: `${operatingPct}%` }} /></i></div>
            <div><div><span>{copy.flightIdentity}</span><strong>{confirmedPct}%</strong></div><i><b style={{ width: `${confirmedPct}%` }} /></i></div>
          </div>
        </aside>
      </div>

      <div className="route-overview-data-grid">
        <section className="route-overview-ranking">
          <h3>{copy.topCarriers}</h3>
          <div className="route-overview-carriers">
            {model.topCarriers.map((carrier) => (
              <button type="button" key={carrier.carrier} onClick={() => onCarrierSelect(carrier.carrier)} title={copy.explore}>
                <span><code>{carrier.carrier}</code><strong>{carrier.name}</strong><em>{carrier.routes.toLocaleString()}</em></span>
                <i><b style={{ width: `${Math.max(4, (carrier.routes / maxCarrier) * 100)}%` }} /></i>
              </button>
            ))}
          </div>
        </section>

        <section className="route-overview-hubs">
          <h3>{copy.topHubs}</h3>
          <ol>
            {model.topHubs.slice(0, 8).map((hub, index) => (
              <li key={hub.iata}><span>{String(index + 1).padStart(2, '0')}</span><code>{hub.iata}</code><strong>{hub.city}</strong><em>{hub.connections}</em><i><b style={{ width: `${Math.max(5, (hub.connections / maxHub) * 100)}%` }} /></i></li>
            ))}
          </ol>
        </section>

        <section className="route-overview-continents">
          <h3>{copy.departures}</h3>
          <div>
            {model.continents.map((row) => (
              <div key={row.continent}><span>{continentLabel(row.continent)}</span><strong>{row.routes.toLocaleString()}</strong><i><b style={{ width: `${Math.max(4, (row.routes / maxContinent) * 100)}%` }} /></i></div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
