import { useEffect, useMemo, useRef, useState } from 'react';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { greatCirclePath } from '../lib/calc/haversine.ts';
import { fitProjectedPoints, type MapPanZoom } from '../lib/map-layout.ts';
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
const MAP_IDENTITY: MapPanZoom = { scale: 1, tx: 0, ty: 0 };

function routeId(route: RouteLibraryRouteCard): string {
  return `${route.from.iata}-${route.to.iata}`;
}

export function RouteEntityMap({
  routes,
  hubs,
  selectedAirport,
  onAirportSelect,
  onRouteSelect,
  stats = [],
}: {
  readonly routes: ReadonlyArray<RouteLibraryRouteCard>;
  readonly hubs: ReadonlyArray<{ readonly airport: Airport; readonly connections: number }>;
  readonly selectedAirport?: Airport | undefined;
  readonly onAirportSelect: (airport: Airport) => void;
  readonly onRouteSelect?: ((routeId: string) => void) | undefined;
  readonly stats?: ReadonlyArray<{ readonly value: string | number; readonly label: string }>;
}): React.ReactElement {
  const { locale } = useLocale();
  const { features } = useWorldMap();
  const focusLon = routes.length === 0
    ? 0
    : selectedAirport?.lon ?? hubs[0]?.airport.lon ?? routes[0]?.from.lon ?? 0;
  const projection = useMemo(
    () => geoEqualEarth().rotate([-focusLon, 0]).scale(198).translate([MAP_W / 2, MAP_H / 2 + 8]),
    [focusLon],
  );
  const path = useMemo(() => geoPath(projection), [projection]);
  const worldPath = useMemo(() => features ? path(features) ?? '' : '', [features, path]);
  const routeGeometry = useMemo(() => {
    const sampleCount = routes.length > 1_500 ? 5
      : routes.length > 800 ? 7
        : routes.length > 320 ? 9
          : routes.length > 120 ? 14
            : routes.length > 40 ? 20
              : 36;
    return routes.map((route) => {
    const samples = greatCirclePath(route.from, route.to, sampleCount);
    const projected = samples.flatMap((point, index) => {
      const xy = projection([point.lon, point.lat]);
      return xy && Number.isFinite(xy[0]) && Number.isFinite(xy[1])
        ? [{ id: `${routeId(route)}:${index}`, x: xy[0], y: xy[1] }]
        : [];
    });
    return { id: routeId(route), route, projected };
  }).filter((row) => row.projected.length > 1);
  }, [routes, projection]);
  const mapNodes = useMemo(() => {
    const byIata = new Map<string, { airport: Airport; routes: RouteLibraryRouteCard[]; connections: number; x: number; y: number }>();
    const add = (airport: Airport, route: RouteLibraryRouteCard | null, weight = 1): void => {
      const point = projection([airport.lon, airport.lat]);
      if (!point) return;
      const current = byIata.get(airport.iata);
      if (current) {
        current.connections += weight;
        if (route && !current.routes.some((row) => routeId(row) === routeId(route))) current.routes.push(route);
        return;
      }
      byIata.set(airport.iata, { airport, routes: route ? [route] : [], connections: weight, x: point[0], y: point[1] });
    };
    for (const route of routes) {
      add(route.from, route);
      add(route.to, route);
    }
    for (const hub of hubs) add(hub.airport, null, Math.max(1, hub.connections));
    return [...byIata.values()];
  }, [routes, hubs, projection]);
  const fitPoints = useMemo(() => [
    ...routeGeometry.flatMap((route) => route.projected),
    ...mapNodes.map((node) => ({ id: `node:${node.airport.iata}`, x: node.x, y: node.y })),
  ], [routeGeometry, mapNodes]);
  const preferredPanZoom = useMemo<MapPanZoom>(() => {
    if (routes.length === 0) return MAP_IDENTITY;
    const routeDistance = routes.length === 1 ? routes[0]?.distanceNm ?? 0 : 0;
    const maxScale = routes.length === 1
      ? routeDistance <= 30 ? 120 : routeDistance <= 100 ? 70 : routeDistance <= 300 ? 35 : routeDistance <= 900 ? 20 : 14
      : routes.length <= 8 ? 12 : routes.length <= 40 ? 7 : 4.5;
    return fitProjectedPoints(fitPoints, { width: MAP_W, height: MAP_H }, {
      padding: { top: 64, right: 82, bottom: 64, left: 82 },
      minScale: 0.8,
      maxScale,
    }) ?? MAP_IDENTITY;
  }, [fitPoints, routes]);
  const fitKey = `${focusLon}:${routes.map(routeId).join('|')}:${hubs.map((hub) => hub.airport.iata).join('|')}`;
  const [panZoom, setPanZoom] = useState<MapPanZoom>(preferredPanZoom);
  const [dragging, setDragging] = useState(false);
  const [hoveredAirport, setHoveredAirport] = useState<string | null>(null);
  const [pinnedAirport, setPinnedAirport] = useState<string | null>(null);
  const lastFitKeyRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origin: MapPanZoom; moved: boolean } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingPanZoomRef = useRef<MapPanZoom | null>(null);

  useEffect(() => {
    if (lastFitKeyRef.current === fitKey) return;
    lastFitKeyRef.current = fitKey;
    setPanZoom(preferredPanZoom);
    setHoveredAirport(null);
    setPinnedAirport(null);
  }, [fitKey, preferredPanZoom]);

  useEffect(() => () => {
    if (dragFrameRef.current !== null) window.cancelAnimationFrame(dragFrameRef.current);
  }, []);

  const maxManualScale = 160;
  const zoomAt = (factor: number, px: number, py: number): void => {
    setPanZoom((current) => {
      const nextScale = Math.max(0.5, Math.min(maxManualScale, current.scale * factor));
      const worldX = (px - current.tx) / current.scale;
      const worldY = (py - current.ty) / current.scale;
      return {
        scale: nextScale,
        tx: px - worldX * nextScale,
        ty: py - worldY * nextScale,
      };
    });
  };
  const zoomCenter = (factor: number): void => zoomAt(factor, MAP_W / 2, MAP_H / 2);

  const mapPointFromEvent = (event: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (MAP_W / Math.max(1, rect.width)),
      y: (event.clientY - rect.top) * (MAP_H / Math.max(1, rect.height)),
    };
  };
  const hitTest = (screenX: number, screenY: number): string | null => {
    let best: { iata: string; distance: number } | null = null;
    for (const node of mapNodes) {
      const x = node.x * panZoom.scale + panZoom.tx;
      const y = node.y * panZoom.scale + panZoom.ty;
      const distance = Math.hypot(screenX - x, screenY - y);
      if (distance <= 14 && (!best || distance < best.distance)) best = { iata: node.airport.iata, distance };
    }
    return best?.iata ?? null;
  };
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, origin: panZoom, moved: false };
    setDragging(true);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const drag = dragRef.current;
    if (!drag) {
      const point = mapPointFromEvent(event);
      setHoveredAirport((current) => {
        const next = hitTest(point.x, point.y);
        return current === next ? current : next;
      });
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - drag.startX) * (MAP_W / Math.max(1, rect.width));
    const dy = (event.clientY - drag.startY) * (MAP_H / Math.max(1, rect.height));
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    pendingPanZoomRef.current = { scale: drag.origin.scale, tx: drag.origin.tx + dx, ty: drag.origin.ty + dy };
    if (dragFrameRef.current === null) {
      dragFrameRef.current = window.requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const next = pendingPanZoomRef.current;
        if (next) setPanZoom(next);
      });
    }
  };
  const endPointerDrag = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const moved = dragRef.current?.moved ?? false;
    if (!moved) {
      const point = mapPointFromEvent(event);
      setPinnedAirport(hitTest(point.x, point.y));
    }
    dragRef.current = null;
    setDragging(false);
  };
  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>): void => {
    event.preventDefault();
    const point = mapPointFromEvent(event);
    zoomAt(Math.exp(-event.deltaY * 0.001), point.x, point.y);
  };
  const mapCopy = locale === 'zh-TW'
    ? { hint: '拖曳移動 · 滾輪縮放', zoomIn: '放大地圖', zoomOut: '縮小地圖', fit: '顯示完整航網', airport: '機場資訊', route: '查看航線', flights: '確認班號' }
    : { hint: 'Drag to pan · scroll to zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit network', airport: 'Airport details', route: 'Open route', flights: 'Confirmed flights' };
  const activeNode = mapNodes.find((node) => node.airport.iata === (pinnedAirport ?? hoveredAirport)) ?? null;
  const worldCanvasPath = useMemo(() => {
    if (!worldPath || typeof Path2D === 'undefined') return null;
    return new Path2D(worldPath);
  }, [worldPath]);

  useEffect(() => {
    if (typeof CanvasRenderingContext2D === 'undefined') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const nextWidth = Math.round(MAP_W * dpr);
    const nextHeight = Math.round(MAP_H * dpr);
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, MAP_W, MAP_H);
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    context.save();
    context.translate(panZoom.tx, panZoom.ty);
    context.scale(panZoom.scale, panZoom.scale);
    if (worldCanvasPath) {
      context.fillStyle = dark ? '#1e2a24' : 'rgba(255,255,255,.72)';
      context.strokeStyle = dark ? '#53655b' : '#aab8ae';
      context.lineWidth = 0.8 / panZoom.scale;
      context.fill(worldCanvasPath);
      context.stroke(worldCanvasPath);
    }
    const activeRouteIds = new Set(activeNode?.routes.map(routeId) ?? []);
    for (const row of routeGeometry) {
      const points = row.projected;
      if (points.length < 2) continue;
      context.beginPath();
      context.moveTo(points[0]!.x, points[0]!.y);
      for (let index = 1; index < points.length; index += 1) context.lineTo(points[index]!.x, points[index]!.y);
      const highlighted = activeRouteIds.has(row.id);
      context.strokeStyle = highlighted ? 'rgba(226,126,55,.95)' : dark ? 'rgba(95,196,165,.42)' : 'rgba(43,130,105,.42)';
      context.lineWidth = (highlighted ? 2.4 : 1.15) / panZoom.scale;
      context.stroke();
    }
    context.restore();

    const maxConnections = Math.max(1, ...mapNodes.map((node) => node.connections));
    const labelThreshold = panZoom.scale >= 2.5;
    const hubCodes = new Set([...mapNodes].sort((a, b) => b.connections - a.connections).slice(0, 10).map((node) => node.airport.iata));
    for (const node of mapNodes) {
      const x = node.x * panZoom.scale + panZoom.tx;
      const y = node.y * panZoom.scale + panZoom.ty;
      if (x < -30 || x > MAP_W + 30 || y < -30 || y > MAP_H + 30) continue;
      const active = node.airport.iata === (pinnedAirport ?? hoveredAirport) || node.airport.iata === selectedAirport?.iata;
      const radius = active ? 7 : 3.5 + (node.connections / maxConnections) * 4;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = active ? '#e27e37' : '#277b68';
      context.fill();
      context.lineWidth = 1.5;
      context.strokeStyle = dark ? '#142019' : '#f7fbf8';
      context.stroke();
      if (active || hubCodes.has(node.airport.iata) || labelThreshold) {
        context.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        context.lineWidth = 4;
        context.strokeStyle = dark ? '#141c18' : '#eff4ef';
        context.fillStyle = dark ? '#d6e2d9' : '#425449';
        context.strokeText(node.airport.iata, x + 10, y + 4);
        context.fillText(node.airport.iata, x + 10, y + 4);
      }
    }
  }, [activeNode, hoveredAirport, mapNodes, panZoom, pinnedAirport, routeGeometry, selectedAirport, worldCanvasPath]);

  return (
    <div className={`entity-map-card${dragging ? ' dragging' : ''}`}>
      <div className="entity-map-interaction-hint">{mapCopy.hint}</div>
      {stats.length > 0 && <div className="entity-map-stats">{stats.map((stat) => <div key={stat.label}><strong>{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</strong><span>{stat.label}</span></div>)}</div>}
      <div className="entity-map-controls" aria-label={locale === 'zh-TW' ? '地圖控制' : 'Map controls'}>
        <button type="button" aria-label={mapCopy.zoomIn} onClick={() => zoomCenter(1.35)}>+</button>
        <button type="button" aria-label={mapCopy.zoomOut} onClick={() => zoomCenter(1 / 1.35)}>−</button>
        <button type="button" className="fit" aria-label={mapCopy.fit} onClick={() => setPanZoom(preferredPanZoom)}>⌖</button>
        <span>{panZoom.scale >= 10 ? panZoom.scale.toFixed(0) : panZoom.scale.toFixed(1)}×</span>
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Route network map"
        data-renderer="canvas"
        data-map-scale={panZoom.scale.toFixed(4)}
        data-map-tx={panZoom.tx.toFixed(2)}
        data-map-ty={panZoom.ty.toFixed(2)}
        data-map-node-count={mapNodes.length}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => { if (!dragRef.current) setHoveredAirport(null); }}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
        onWheel={onWheel}
      />
      {activeNode && <aside className="entity-map-inspector" aria-live="polite">
        <header><div><code>{activeNode.airport.iata}</code><strong>{activeNode.airport.city}</strong></div><button type="button" onClick={() => { setPinnedAirport(null); setHoveredAirport(null); }}>×</button></header>
        <p>{activeNode.airport.name}</p>
        {activeNode.routes.length > 0 && <div className="entity-map-inspector-routes">
          {activeNode.routes.slice(0, 4).map((route) => {
            const carriers = route.carriers.map((carrier) => carrier.carrier).join(' · ');
            const numbers = route.carriers.flatMap((carrier) => carrier.confirmedNumbers).slice(0, 5);
            return <div key={routeId(route)}><span><code>{route.from.iata}</code> → <code>{route.to.iata}</code><b>{route.distanceNm.toLocaleString()} nm</b></span><small>{carriers}</small>{numbers.length > 0 && <em>{mapCopy.flights}: {numbers.join(' · ')}</em>}{onRouteSelect && <button type="button" onClick={() => onRouteSelect(routeId(route))}>{mapCopy.route}</button>}</div>;
          })}
        </div>}
        <button type="button" className="entity-map-airport-action" onClick={() => onAirportSelect(activeNode.airport)}>{mapCopy.airport}</button>
      </aside>}
    </div>
  );
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
  const [showRouteIndex, setShowRouteIndex] = useState(false);
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
    setShowRouteIndex(false);
    onSelect(next);
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
          <div><span>AIRPORT</span><h2><code>{airportProfile.airport.iata}</code> · {airportProfile.airport.city}</h2><p>{airportProfile.airport.name}</p></div>
        </header>
        <section className="entity-section map-primary-section"><RouteEntityMap routes={airportProfile.outgoingRoutes} hubs={hubs} selectedAirport={airportProfile.airport} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} onRouteSelect={(id) => choose({ kind: 'route', id })} stats={[{ value: airportProfile.destinationCount, label: copy.outbound }, { value: airportProfile.airlineCount, label: copy.airlines }, { value: airportProfile.countryCount, label: copy.countries }, { value: airportProfile.incomingRouteCount, label: copy.inbound }]} /></section>
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
          <div><span>AIRLINE</span><h2><code>{airlineProfile.carrier}</code> · {airlineProfile.name}</h2><p>{copy.airlineNetwork}</p></div>
        </header>
        <section className="entity-section map-primary-section"><RouteEntityMap routes={airlineProfile.routes} hubs={airlineProfile.topHubs} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} onRouteSelect={(id) => choose({ kind: 'route', id })} stats={[{ value: airlineProfile.routes.length, label: copy.routes }, { value: airlineProfile.airportCount, label: copy.airports }, { value: airlineProfile.countryCount, label: copy.countries }, { value: airlineProfile.operatingRouteCount, label: copy.operating }]} /></section>
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
          <div><span>ROUTE</span><h2><code>{route.from.iata}</code><b>→</b><code>{route.to.iata}</code></h2><p>{route.from.city} → {route.to.city}</p></div>
        </header>
        <section className="entity-section map-primary-section"><RouteEntityMap routes={[route]} hubs={[{ airport: route.from, connections: 1 }, { airport: route.to, connections: 1 }]} selectedAirport={route.from} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} onRouteSelect={(id) => choose({ kind: 'route', id })} stats={[{ value: `${route.distanceNm.toLocaleString()} nm`, label: copy.distance }, { value: route.carriers.length, label: copy.airlines }, { value: route.carriers.filter((carrier) => carrier.confirmedNumbers.length > 0).length, label: copy.confirmed }]} /></section>
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
          <RouteEntityMap routes={[]} hubs={topHubPoints} onAirportSelect={(airport) => choose({ kind: 'airport', id: airport.iata })} stats={[{ value: overview.routeCount, label: copy.routes }, { value: overview.airportCount, label: copy.airports }, { value: overview.carrierCount, label: copy.airlines }, { value: overview.confirmedNumberCount, label: copy.confirmed }]} />
        </div>
      ) : entityContent}
    </section>
  );
}
