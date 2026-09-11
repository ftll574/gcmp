import type { RouteLibraryRouteCard } from '../lib/rtw/route-library-entities.ts';

const WIDTH = 1000;
const HEIGHT = 560;
const PADDING = 48;
const MAX_PREVIEW_ROUTES = 96;
const MAX_PREVIEW_AIRPORTS = 72;

export interface RouteLibraryMapPreviewStat {
  readonly value: string | number;
  readonly label: string;
}

interface Props {
  readonly routes: ReadonlyArray<RouteLibraryRouteCard>;
  readonly stats: ReadonlyArray<RouteLibraryMapPreviewStat>;
  readonly zh: boolean;
  readonly embedded?: boolean | undefined;
}

interface PreviewBounds {
  readonly minLon: number;
  readonly maxLon: number;
  readonly minLat: number;
  readonly maxLat: number;
  readonly anchorLon: number;
  readonly detailed: boolean;
}

function sampleEvenly<T>(rows: ReadonlyArray<T>, limit: number): ReadonlyArray<T> {
  if (rows.length <= limit) return rows;
  return Array.from({ length: limit }, (_, index) => rows[Math.floor(index * (rows.length - 1) / (limit - 1))]!).filter(Boolean);
}

function unwrapNear(lon: number, anchor: number): number {
  let next = lon;
  while (next - anchor > 180) next -= 360;
  while (next - anchor < -180) next += 360;
  return next;
}

function detailedBounds(routes: ReadonlyArray<RouteLibraryRouteCard>): PreviewBounds {
  const anchorLon = routes[0]?.from.lon ?? 0;
  const coordinates = routes.flatMap((route) => [
    [unwrapNear(route.from.lon, anchorLon), route.from.lat] as const,
    [unwrapNear(route.to.lon, anchorLon), route.to.lat] as const,
  ]);
  const minLon = Math.min(...coordinates.map(([lon]) => lon));
  const maxLon = Math.max(...coordinates.map(([lon]) => lon));
  const minLat = Math.min(...coordinates.map(([, lat]) => lat));
  const maxLat = Math.max(...coordinates.map(([, lat]) => lat));
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const lonSpan = Math.max(12, maxLon - minLon) * 1.28;
  const latSpan = Math.max(9, maxLat - minLat) * 1.6;
  return {
    minLon: centerLon - lonSpan / 2,
    maxLon: centerLon + lonSpan / 2,
    minLat: centerLat - latSpan / 2,
    maxLat: centerLat + latSpan / 2,
    anchorLon,
    detailed: true,
  };
}

function previewBounds(routes: ReadonlyArray<RouteLibraryRouteCard>): PreviewBounds {
  if (routes.length > 0 && routes.length <= 3) return detailedBounds(routes);
  return { minLon: -180, maxLon: 180, minLat: -66, maxLat: 82, anchorLon: 0, detailed: false };
}

function project(lon: number, lat: number, bounds: PreviewBounds): readonly [number, number] {
  const normalizedLon = bounds.detailed ? unwrapNear(lon, bounds.anchorLon) : lon;
  const safeLat = Math.max(bounds.minLat, Math.min(bounds.maxLat, lat));
  const x = PADDING + (normalizedLon - bounds.minLon) / Math.max(1, bounds.maxLon - bounds.minLon) * (WIDTH - PADDING * 2);
  const y = PADDING + (bounds.maxLat - safeLat) / Math.max(1, bounds.maxLat - bounds.minLat) * (HEIGHT - PADDING * 2);
  return [x, y];
}

function worldSegments(route: RouteLibraryRouteCard): ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]> {
  const from: readonly [number, number] = [route.from.lon, route.from.lat];
  const to: readonly [number, number] = [route.to.lon, route.to.lat];
  const delta = to[0] - from[0];
  if (Math.abs(delta) <= 180) return [[from, to]];
  const adjustedToLon = delta > 180 ? to[0] - 360 : to[0] + 360;
  const boundary = adjustedToLon > from[0] ? 180 : -180;
  const denominator = adjustedToLon - from[0];
  const t = denominator === 0 ? 0.5 : (boundary - from[0]) / denominator;
  const boundaryLat = from[1] + (to[1] - from[1]) * t;
  return [
    [from, [boundary, boundaryLat]],
    [[-boundary, boundaryLat], to],
  ];
}

function routeSegments(route: RouteLibraryRouteCard, bounds: PreviewBounds): ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]> {
  if (!bounds.detailed) return worldSegments(route);
  return [[
    [unwrapNear(route.from.lon, bounds.anchorLon), route.from.lat],
    [unwrapNear(route.to.lon, bounds.anchorLon), route.to.lat],
  ]];
}

function curvePath(
  start: readonly [number, number],
  end: readonly [number, number],
  bounds: PreviewBounds,
): string {
  const [x1, y1] = project(start[0], start[1], bounds);
  const [x2, y2] = project(end[0], end[1], bounds);
  const distance = Math.hypot(x2 - x1, y2 - y1);
  const curvature = Math.min(58, Math.max(7, distance * 0.09));
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 - curvature;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

export function RouteLibraryMapPreview({ routes, stats, zh, embedded = false }: Props): React.ReactElement {
  const sampledRoutes = sampleEvenly(routes, MAX_PREVIEW_ROUTES);
  const bounds = previewBounds(sampledRoutes);
  const airports = sampleEvenly(
    [...new Map(sampledRoutes.flatMap((route) => [[route.from.iata, route.from] as const, [route.to.iata, route.to] as const])).values()],
    MAX_PREVIEW_AIRPORTS,
  );

  return (
    <div className={embedded ? 'entity-map-preview-layer' : 'entity-map-card maplibre-route-map entity-map-loading'} role="status" data-map-preview="true" aria-live="polite">
      <svg className="entity-map-preview" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
        <g className="entity-map-preview-grid">
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => <line key={`v-${ratio}`} x1={WIDTH * ratio} y1={PADDING} x2={WIDTH * ratio} y2={HEIGHT - PADDING} />)}
          {[0.25, 0.5, 0.75].map((ratio) => <line key={`h-${ratio}`} x1={PADDING} y1={HEIGHT * ratio} x2={WIDTH - PADDING} y2={HEIGHT * ratio} />)}
        </g>
        <g className="entity-map-preview-routes">
          {sampledRoutes.flatMap((route) => routeSegments(route, bounds).map((segment, segmentIndex) => (
            <path key={`${route.from.iata}-${route.to.iata}-${segmentIndex}`} d={curvePath(segment[0], segment[1], bounds)} />
          )))}
        </g>
        <g className="entity-map-preview-airports">
          {airports.map((airport) => {
            const [x, y] = project(airport.lon, airport.lat, bounds);
            return <circle key={airport.iata} cx={x} cy={y} r={routes.length <= 3 ? 7 : 4} />;
          })}
        </g>
      </svg>
      {stats.length > 0 && <div className="entity-map-stats entity-map-preview-stats">
        {stats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}
      </div>}
      <div className="entity-map-preview-status">
        <strong>{zh ? '航網資料已就緒' : 'Network data is ready'}</strong>
        <span>{zh ? '正在啟動互動地圖…' : 'Starting the interactive map…'}</span>
      </div>
    </div>
  );
}
