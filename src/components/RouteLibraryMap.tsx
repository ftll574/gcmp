import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import './RouteLibraryMap.css';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Airport } from '../lib/types.ts';
import {
  buildClusterBundledRoutes,
  buildRouteMapModel,
  nearestRouteIdByScreenDistance,
  routeMapBounds,
  type RouteMapEndpointRepresentative,
  type RouteMapBounds,
  type RouteMapModel,
} from '../lib/rtw/route-library-map.ts';
import type { RouteLibraryEntitySelection, RouteLibraryRouteCard, RouteLibrarySearchResult } from '../lib/rtw/route-library-entities.ts';
import { useLocale } from '../i18n/use-locale.ts';

const EMPTY_FEATURES: FeatureCollection<Geometry> = { type: 'FeatureCollection', features: [] };
const BASEMAP_LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const BASEMAP_DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const ROUTE_SOURCE = 'gcmp-routes';
const FOCUS_ROUTE_SOURCE = 'gcmp-focused-routes';
const AIRPORT_SOURCE = 'gcmp-airports';
const FOCUS_AIRPORT_SOURCE = 'gcmp-focused-airport';
const ROUTE_LAYER = 'gcmp-route-lines';
const ROUTE_HIT_LAYER = 'gcmp-route-hit';
const FOCUS_ROUTE_LAYER = 'gcmp-route-focus';
const CLUSTER_LAYER = 'gcmp-airport-clusters';
const CLUSTER_COUNT_LAYER = 'gcmp-airport-cluster-count';
const AIRPORT_LAYER = 'gcmp-airports';
const FOCUS_AIRPORT_LAYER = 'gcmp-airport-focus';
const HIT_SEARCH_RADIUS_PX = 10;
const ROUTE_SELECT_RADIUS_PX = 18;

export type RouteMapAllianceTheme = 'all' | 'star' | 'oneworld' | 'skyteam';

interface RouteMapControls {
  readonly alliance: RouteMapAllianceTheme;
  readonly onAllianceChange: (alliance: RouteMapAllianceTheme) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly searchOpen: boolean;
  readonly onSearchOpenChange: (open: boolean) => void;
  readonly searchPlaceholder: string;
  readonly searchResults: ReadonlyArray<RouteLibrarySearchResult>;
  readonly onSearchResultSelect: (selection: RouteLibraryEntitySelection) => void;
}

const ALLIANCE_ACCENTS: Readonly<Record<RouteMapAllianceTheme, { readonly light: string; readonly dark: string }>> = {
  all: { light: '#277b68', dark: '#65c5a7' },
  star: { light: '#9a7226', dark: '#d4ad58' },
  oneworld: { light: '#6b57a5', dark: '#a797df' },
  skyteam: { light: '#356f9f', dark: '#73abd5' },
};

interface RouteEntityMapProps {
  readonly routes: ReadonlyArray<RouteLibraryRouteCard>;
  readonly hubs: ReadonlyArray<{ readonly airport: Airport; readonly connections: number }>;
  readonly selectedAirport?: Airport | undefined;
  readonly selectedRouteId?: string | undefined;
  readonly onAirportSelect: (airport: Airport) => void;
  readonly onRouteSelect?: ((routeId: string) => void) | undefined;
  readonly stats?: ReadonlyArray<{ readonly value: string | number; readonly label: string }>;
  readonly allianceTheme?: RouteMapAllianceTheme | undefined;
  readonly fingerprint?: boolean | undefined;
  readonly controls?: RouteMapControls | undefined;
}

type InspectorSelection =
  | { readonly kind: 'airport'; readonly iata: string }
  | { readonly kind: 'route'; readonly routeId: string }
  | null;

interface HoverInfo {
  readonly kind: 'airport' | 'route';
  readonly title: string;
  readonly subtitle: string;
  readonly x: number;
  readonly y: number;
}

function isWebGlAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function mapStyle(dark: boolean): string {
  return dark ? BASEMAP_DARK_STYLE : BASEMAP_LIGHT_STYLE;
}

function source(map: MapLibreMap, id: string): GeoJSONSource | null {
  return (map.getSource(id) as GeoJSONSource | undefined) ?? null;
}

function addSourcesAndLayers(map: MapLibreMap, dark: boolean): void {
  map.addSource(ROUTE_SOURCE, { type: 'geojson', data: EMPTY_FEATURES, lineMetrics: true });
  map.addSource(FOCUS_ROUTE_SOURCE, { type: 'geojson', data: EMPTY_FEATURES, lineMetrics: true });
  map.addSource(AIRPORT_SOURCE, {
    type: 'geojson',
    data: EMPTY_FEATURES,
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 5,
  });
  map.addSource(FOCUS_AIRPORT_SOURCE, { type: 'geojson', data: EMPTY_FEATURES });

  map.addLayer({
    id: ROUTE_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    paint: {
      'line-color': dark ? '#67c9ab' : '#3b8f78',
      'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 3, 1.2, 8, 2],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.22, 3, 0.38, 8, 0.58],
    },
  });
  map.addLayer({
    id: ROUTE_HIT_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    paint: { 'line-color': '#000000', 'line-width': 14, 'line-opacity': 0.001 },
  });
  map.addLayer({
    id: FOCUS_ROUTE_LAYER,
    type: 'line',
    source: FOCUS_ROUTE_SOURCE,
    paint: {
      'line-color': '#e37f38',
      'line-width': ['interpolate', ['linear'], ['zoom'], 0, 2, 5, 3.6, 10, 5],
      'line-opacity': 0.96,
    },
  });
  map.addLayer({
    id: CLUSTER_LAYER,
    type: 'circle',
    source: AIRPORT_SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': dark ? '#65c5a7' : '#277b68',
      'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 35, 24, 100, 30],
      'circle-opacity': 0.88,
      'circle-stroke-color': dark ? '#101813' : '#f7fbf8',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: CLUSTER_COUNT_LAYER,
    type: 'symbol',
    source: AIRPORT_SOURCE,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 10,
    },
    paint: {
      'text-color': dark ? '#101813' : '#ffffff',
    },
  });
  map.addLayer({
    id: AIRPORT_LAYER,
    type: 'circle',
    source: AIRPORT_SOURCE,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': dark ? '#65c5a7' : '#277b68',
      'circle-radius': ['interpolate', ['linear'], ['get', 'connections'], 0, 3, 10, 4.5, 80, 7, 300, 10],
      'circle-stroke-color': dark ? '#101813' : '#f7fbf8',
      'circle-stroke-width': 1.6,
      'circle-opacity': 0.96,
    },
  });
  map.addLayer({
    id: 'gcmp-hub-labels',
    type: 'symbol',
    source: AIRPORT_SOURCE,
    filter: ['all', ['!', ['has', 'point_count']], ['<', ['get', 'hubRank'], 12]],
    layout: {
      'text-field': ['get', 'iata'],
      'text-size': 10,
      'text-offset': [0.9, 0],
      'text-anchor': 'left',
      'text-allow-overlap': false,
      'text-ignore-placement': false,
    },
    paint: {
      'text-color': dark ? '#d7e3db' : '#43534a',
      'text-halo-color': dark ? '#111a16' : '#f7faf7',
      'text-halo-width': 1.6,
    },
  });
  map.addLayer({
    id: FOCUS_AIRPORT_LAYER,
    type: 'circle',
    source: FOCUS_AIRPORT_SOURCE,
    paint: {
      'circle-color': '#e37f38',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 7, 8, 11],
      'circle-stroke-color': dark ? '#111a16' : '#ffffff',
      'circle-stroke-width': 2.5,
    },
  });
}

function applyMapAppearance(
  map: MapLibreMap,
  dark: boolean,
  allianceTheme: RouteMapAllianceTheme,
  fingerprint: boolean,
): void {
  const accent = dark ? ALLIANCE_ACCENTS[allianceTheme].dark : ALLIANCE_ACCENTS[allianceTheme].light;
  map.setPaintProperty(ROUTE_LAYER, 'line-color', accent);
  const bundleScale: ExpressionSpecification = ['interpolate', ['linear'], ['coalesce', ['get', 'bundleCount'], 1], 1, 1, 4, 1.2, 12, 1.5, 40, 2.1];
  map.setPaintProperty(ROUTE_LAYER, 'line-width', fingerprint
    ? ['*', ['interpolate', ['linear'], ['zoom'], 0, 0.8, 3, 1.35, 8, 2.2], ['interpolate', ['linear'], ['get', 'importance'], 0, 0.55, 0.45, 1, 1, 2.05], bundleScale]
    : ['*', ['interpolate', ['linear'], ['zoom'], 0, 0.7, 3, 1.2, 8, 2], bundleScale]);
  map.setPaintProperty(ROUTE_LAYER, 'line-opacity', fingerprint
    ? ['interpolate', ['linear'], ['zoom'],
        0, ['interpolate', ['linear'], ['get', 'importance'], 0, 0.005, 0.45, 0.025, 0.7, 0.16, 1, 0.72],
        2, ['interpolate', ['linear'], ['get', 'importance'], 0, 0.025, 0.35, 0.12, 0.7, 0.4, 1, 0.82],
        5, ['interpolate', ['linear'], ['get', 'importance'], 0, 0.14, 0.35, 0.34, 0.7, 0.64, 1, 0.9]]
    : ['interpolate', ['linear'], ['zoom'], 0, 0.22, 3, 0.38, 8, 0.58]);
  map.setPaintProperty(AIRPORT_LAYER, 'circle-color', accent);
  map.setPaintProperty(CLUSTER_LAYER, 'circle-color', accent);
  map.setPaintProperty(AIRPORT_LAYER, 'circle-opacity', fingerprint
    ? ['interpolate', ['linear'], ['get', 'connections'], 1, 0.12, 8, 0.2, 30, 0.4, 100, 0.72, 250, 0.96]
    : 0.96);
  map.setPaintProperty(AIRPORT_LAYER, 'circle-radius', fingerprint
    ? ['interpolate', ['linear'], ['get', 'connections'], 1, 1.8, 8, 2.5, 30, 3.7, 100, 6.8, 300, 10.8]
    : ['interpolate', ['linear'], ['get', 'connections'], 0, 3, 10, 4.5, 80, 7, 300, 10]);
}

function focusedAirportIatas(model: RouteMapModel, selection: InspectorSelection): ReadonlySet<string> {
  if (!selection) return new Set();
  if (selection.kind === 'airport') return new Set([selection.iata]);
  const route = model.routeById.get(selection.routeId);
  return route ? new Set([route.from.iata, route.to.iata]) : new Set();
}

function airportSourceData(model: RouteMapModel, selection: InspectorSelection): typeof model.airports {
  const focused = focusedAirportIatas(model, selection);
  if (focused.size === 0) return model.airports;
  return { type: 'FeatureCollection', features: model.airports.features.filter((feature) => !focused.has(feature.properties.iata)) };
}

async function clusterRepresentatives(
  map: MapLibreMap,
): Promise<ReadonlyMap<string, RouteMapEndpointRepresentative>> {
  if (map.getZoom() > 5.01) return new Map();
  const airportSource = source(map, AIRPORT_SOURCE);
  if (!airportSource || !map.getLayer(CLUSTER_LAYER)) return new Map();

  const clusters = map.queryRenderedFeatures({ layers: [CLUSTER_LAYER] });
  const byId = new Map<number, maplibregl.MapGeoJSONFeature>();
  for (const cluster of clusters) {
    const clusterId = Number(cluster.properties?.cluster_id);
    if (Number.isFinite(clusterId) && !byId.has(clusterId)) byId.set(clusterId, cluster);
  }

  const representatives = new Map<string, RouteMapEndpointRepresentative>();
  await Promise.all([...byId.entries()].map(async ([clusterId, cluster]) => {
    if (cluster.geometry.type !== 'Point') return;
    const pointCount = Number(cluster.properties?.point_count ?? 0);
    if (!Number.isFinite(pointCount) || pointCount <= 0) return;
    const [lon, lat] = cluster.geometry.coordinates as [number, number];
    const leaves = await airportSource.getClusterLeaves(clusterId, pointCount, 0);
    for (const leaf of leaves) {
      const iata = String(leaf.properties?.iata ?? '');
      if (iata) representatives.set(iata, { key: `cluster:${clusterId}`, lon, lat });
    }
  }));
  return representatives;
}

function boundsToMapLibre(bounds: RouteMapBounds): [[number, number], [number, number]] {
  return [[bounds[0][0], bounds[0][1]], [bounds[1][0], bounds[1][1]]];
}

function focusPadding(container: HTMLElement): { top: number; right: number; bottom: number; left: number } {
  return container.clientWidth < 720
    ? { top: 72, right: 28, bottom: 220, left: 28 }
    : { top: 76, right: 390, bottom: 48, left: 48 };
}

function fitModel(map: MapLibreMap, container: HTMLElement, model: RouteMapModel, routes: ReadonlyArray<RouteLibraryRouteCard>, selectedAirport?: Airport): void {
  if (routes.length === 0) {
    map.easeTo({ center: [0, 18], zoom: 0.55, duration: 420 });
    return;
  }
  const bounds = routeMapBounds(model, null, null, selectedAirport?.lon ?? routes[0]?.from.lon);
  if (!bounds) return;
  const maxZoom = routes.length === 1
    ? routes[0]!.distanceNm <= 30 ? 10.5 : routes[0]!.distanceNm <= 150 ? 8.5 : routes[0]!.distanceNm <= 800 ? 6.5 : 4.5
    : routes.length <= 12 ? 5.5 : routes.length <= 120 ? 3.6 : 2.2;
  map.fitBounds(boundsToMapLibre(bounds), { padding: focusPadding(container), maxZoom, duration: 520 });
}

function setFocusSources(map: MapLibreMap, model: RouteMapModel, selection: InspectorSelection): void {
  const focusRoutes = selection?.kind === 'route'
    ? [model.routeById.get(selection.routeId)].filter((route): route is RouteLibraryRouteCard => route !== undefined)
    : [];
  const focusRouteIds = new Set(focusRoutes.map((route) => `${route.from.iata}-${route.to.iata}`));
  source(map, FOCUS_ROUTE_SOURCE)?.setData({
    type: 'FeatureCollection',
    features: model.routes.features.filter((feature) => focusRouteIds.has(feature.properties.routeId)),
  });
  const focusIatas = focusedAirportIatas(model, selection);
  source(map, FOCUS_AIRPORT_SOURCE)?.setData({
    type: 'FeatureCollection',
    features: model.airports.features.filter((feature) => focusIatas.has(feature.properties.iata)),
  });
}

function inspectorRoutes(model: RouteMapModel, selection: InspectorSelection): ReadonlyArray<RouteLibraryRouteCard> {
  if (!selection) return [];
  if (selection.kind === 'route') {
    const route = model.routeById.get(selection.routeId);
    return route ? [route] : [];
  }
  return model.routesByAirport.get(selection.iata) ?? [];
}

export function RouteEntityMap({
  routes,
  hubs,
  selectedAirport,
  selectedRouteId,
  onAirportSelect,
  onRouteSelect,
  stats = [],
  allianceTheme = 'all',
  fingerprint = false,
  controls,
}: RouteEntityMapProps): React.ReactElement {
  const { locale } = useLocale();
  const cardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const routeBundleRevisionRef = useRef(0);
  const didInitialFitRef = useRef(false);
  const lastSelectionKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<InspectorSelection>(
    selectedRouteId ? { kind: 'route', routeId: selectedRouteId } : selectedAirport ? { kind: 'airport', iata: selectedAirport.iata } : null,
  );
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [webGlAvailable] = useState(isWebGlAvailable);
  const model = useMemo(() => buildRouteMapModel(routes, hubs), [routes, hubs]);
  const copy = locale === 'zh-TW'
    ? { fit: '顯示完整航網', airport: '機場資訊', route: '航線詳情', confirmed: '已確認班號', noConfirmed: '尚無 confirmed 班號', fallback: '此瀏覽器無法啟用互動地圖。', coreHubs: '核心樞紐', all: '全部', clusters: '個機場', zoomCluster: '點擊放大查看' }
    : { fit: 'Fit network', airport: 'Airport details', route: 'Route details', confirmed: 'Confirmed flights', noConfirmed: 'No confirmed flight number', fallback: 'Interactive map is unavailable in this browser.', coreHubs: 'Core hubs', all: 'All', clusters: 'airports', zoomCluster: 'Click to zoom in' };

  const focusSelection = useCallback((next: InspectorSelection, animate = true): void => {
    setSelection(next);
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || !next) return;
    setFocusSources(map, model, next);
    if (next.kind === 'route') {
      const route = model.routeById.get(next.routeId);
      if (!route) return;
      const routeIds = new Set([next.routeId]);
      const airportIds = new Set([route.from.iata, route.to.iata]);
      const bounds = routeMapBounds(model, routeIds, airportIds, route.from.lon);
      if (bounds) map.fitBounds(boundsToMapLibre(bounds), { padding: focusPadding(container), maxZoom: route.distanceNm <= 30 ? 10.5 : 7.5, duration: animate ? 480 : 0 });
      return;
    }
    const airport = model.airportByIata.get(next.iata);
    const related = model.routesByAirport.get(next.iata) ?? [];
    if (!airport) return;
    if (related.length === 0) {
      map.easeTo({ center: [airport.lon, airport.lat], zoom: Math.max(map.getZoom(), 4), duration: animate ? 420 : 0 });
      return;
    }
    const routeIds = new Set(related.map((route) => `${route.from.iata}-${route.to.iata}`));
    const airportIds = new Set([next.iata, ...related.flatMap((route) => [route.from.iata, route.to.iata])]);
    const bounds = routeMapBounds(model, routeIds, airportIds, airport.lon);
    if (bounds) map.fitBounds(boundsToMapLibre(bounds), { padding: focusPadding(container), maxZoom: related.length <= 3 ? 7 : 5.4, duration: animate ? 480 : 0 });
  }, [model]);

  const refreshClusterAwareRoutes = useCallback(async (map: MapLibreMap, activeSelection: InspectorSelection): Promise<void> => {
    const revision = ++routeBundleRevisionRef.current;
    if (map.getZoom() > 5.01) {
      source(map, ROUTE_SOURCE)?.setData(model.routes);
      if (cardRef.current) cardRef.current.dataset.mapBundledRoutes = '0';
      return;
    }
    try {
      const representatives = await clusterRepresentatives(map);
      if (revision !== routeBundleRevisionRef.current) return;
      // Focused airport/route endpoints are deliberately excluded from the cluster source,
      // so they remain real endpoints while the other airports snap to cluster centers.
      const focused = focusedAirportIatas(model, activeSelection);
      const withFocus = new Map(representatives);
      for (const iata of focused) {
        const airport = model.airportByIata.get(iata);
        if (airport) withFocus.set(iata, { key: `focus:${iata}`, lon: airport.lon, lat: airport.lat });
      }
      const bundled = buildClusterBundledRoutes(model, withFocus);
      source(map, ROUTE_SOURCE)?.setData(bundled);
      if (cardRef.current) {
        cardRef.current.dataset.mapBundledRoutes = String(bundled.features.length);
        cardRef.current.dataset.mapBundleRepresentatives = String(representatives.size);
        cardRef.current.dataset.mapFocusedAirports = String(focused.size);
      }
    } catch (reason) {
      if (revision !== routeBundleRevisionRef.current) return;
      source(map, ROUTE_SOURCE)?.setData(model.routes);
      if (cardRef.current) cardRef.current.dataset.mapBundleError = reason instanceof Error ? reason.message : String(reason);
    }
  }, [model]);

  useEffect(() => {
    if (!webGlAvailable || !containerRef.current || mapRef.current) return;
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    maplibregl.setWorkerUrl(maplibreWorkerUrl);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle(dark),
      center: [0, 18],
      zoom: 0.55,
      minZoom: 0,
      maxZoom: 12,
      attributionControl: false,
      renderWorldCopies: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      try {
        addSourcesAndLayers(map, dark);
        setReady(true);
      } catch (reason) {
        if (cardRef.current) cardRef.current.dataset.mapError = reason instanceof Error ? reason.message : String(reason);
        console.error('Route library map initialization failed', reason);
      }
    });
    map.on('error', (event) => {
      if (cardRef.current && event.error) cardRef.current.dataset.mapError = event.error.message;
    });
    const updateDiagnostics = (): void => {
      const card = cardRef.current;
      if (!card || !map.isStyleLoaded() || !map.getLayer(CLUSTER_LAYER)) return;
      const clusters = map.queryRenderedFeatures({ layers: [CLUSTER_LAYER] });
      const center = map.getCenter();
      card.dataset.mapZoom = map.getZoom().toFixed(2);
      card.dataset.mapCenter = `${center.lng.toFixed(3)},${center.lat.toFixed(3)}`;
      card.dataset.mapClusters = String(clusters.length);
      card.dataset.mapVisibleAirports = String(map.queryRenderedFeatures({ layers: [AIRPORT_LAYER] }).length);
      const firstCluster = clusters.find((feature) => feature.geometry.type === 'Point');
      if (firstCluster?.geometry.type === 'Point') {
        const [lon, lat] = firstCluster.geometry.coordinates as [number, number];
        const point = map.project([lon, lat]);
        card.dataset.mapFirstClusterX = point.x.toFixed(1);
        card.dataset.mapFirstClusterY = point.y.toFixed(1);
        card.dataset.mapFirstClusterSize = String(firstCluster.properties?.point_count ?? '');
      } else {
        delete card.dataset.mapFirstClusterX;
        delete card.dataset.mapFirstClusterY;
        delete card.dataset.mapFirstClusterSize;
      }
    };
    map.on('idle', updateDiagnostics);
    return () => {
      map.off('idle', updateDiagnostics);
      map.remove();
      mapRef.current = null;
    };
  }, [webGlAvailable]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.isStyleLoaded()) return;
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    applyMapAppearance(map, dark, allianceTheme, fingerprint);
  }, [allianceTheme, fingerprint, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!ready || !map || !container) return;
    const initial: InspectorSelection = selectedRouteId
      ? { kind: 'route', routeId: selectedRouteId }
      : selectedAirport ? { kind: 'airport', iata: selectedAirport.iata } : null;
    source(map, ROUTE_SOURCE)?.setData(model.routes);
    source(map, AIRPORT_SOURCE)?.setData(airportSourceData(model, initial));
    setFocusSources(map, model, initial);
    const selectionKey = initial?.kind === 'route'
      ? `route:${initial.routeId}`
      : initial?.kind === 'airport' ? `airport:${initial.iata}` : null;
    const shouldMoveCamera = !didInitialFitRef.current || lastSelectionKeyRef.current !== selectionKey;
    setSelection(initial);
    if (initial && shouldMoveCamera) {
      window.requestAnimationFrame(() => focusSelection(initial, false));
    } else if (!initial && shouldMoveCamera) {
      fitModel(map, container, model, routes, selectedAirport);
    }
    didInitialFitRef.current = true;
    lastSelectionKeyRef.current = selectionKey;
    map.once('idle', () => { void refreshClusterAwareRoutes(map, initial); });
  }, [focusSelection, model, ready, refreshClusterAwareRoutes, routes, selectedAirport, selectedRouteId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const onMoveEnd = (): void => { void refreshClusterAwareRoutes(map, selection); };
    map.on('moveend', onMoveEnd);
    return () => { map.off('moveend', onMoveEnd); };
  }, [ready, refreshClusterAwareRoutes, selection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const canvas = map.getCanvas();
    const nearestAirport = (features: ReadonlyArray<maplibregl.MapGeoJSONFeature>, point: maplibregl.Point): maplibregl.MapGeoJSONFeature | null => {
      let best: { feature: maplibregl.MapGeoJSONFeature; distance: number } | null = null;
      for (const feature of features) {
        if (feature.layer.id !== AIRPORT_LAYER || feature.geometry.type !== 'Point') continue;
        const iata = String(feature.properties?.iata ?? '');
        const sourceAirport = model.airportByIata.get(iata);
        const [lon, lat] = sourceAirport
          ? [sourceAirport.lon, sourceAirport.lat]
          : feature.geometry.coordinates as [number, number];
        const candidates = [lon - 360, lon, lon + 360].map((candidateLon) => map.project([candidateLon, lat]));
        const distance = Math.min(...candidates.map((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y)));
        if (!best || distance < best.distance) best = { feature, distance };
      }
      return best?.feature ?? null;
    };
    const nearestRoute = (features: ReadonlyArray<maplibregl.MapGeoJSONFeature>, point: maplibregl.Point): maplibregl.MapGeoJSONFeature | null => {
      const routeFeatures = features.filter((feature) => feature.layer.id === ROUTE_HIT_LAYER);
      const routeId = nearestRouteIdByScreenDistance(
        model,
        routeFeatures.map((feature) => String(feature.properties?.routeId ?? '')).filter(Boolean),
        point,
        (lon, lat) => map.project([lon, lat]),
        ROUTE_SELECT_RADIUS_PX,
      );
      return routeId ? routeFeatures.find((feature) => String(feature.properties?.routeId ?? '') === routeId) ?? null : null;
    };
    const featuresAt = (point: maplibregl.Point): { cluster: maplibregl.MapGeoJSONFeature | null; airport: maplibregl.MapGeoJSONFeature | null; route: maplibregl.MapGeoJSONFeature | null } => {
      const features = map.queryRenderedFeatures([
        [point.x - HIT_SEARCH_RADIUS_PX, point.y - HIT_SEARCH_RADIUS_PX],
        [point.x + HIT_SEARCH_RADIUS_PX, point.y + HIT_SEARCH_RADIUS_PX],
      ], { layers: [CLUSTER_LAYER, AIRPORT_LAYER, ROUTE_HIT_LAYER] });
      return {
        cluster: features.find((feature) => feature.layer.id === CLUSTER_LAYER) ?? null,
        airport: nearestAirport(features, point),
        route: nearestRoute(features, point),
      };
    };
    const onMapMove = (event: maplibregl.MapMouseEvent): void => {
      const { cluster, airport, route } = featuresAt(event.point);
      if (cluster) {
        canvas.style.cursor = 'pointer';
        const count = Number(cluster.properties?.point_count ?? 0);
        setHover({ kind: 'airport', title: `${count} ${copy.clusters}`, subtitle: copy.zoomCluster, x: event.point.x, y: event.point.y });
        return;
      }
      if (airport) {
        canvas.style.cursor = 'pointer';
        const iata = String(airport.properties?.iata ?? '');
        const city = String(airport.properties?.city ?? '');
        const routeCount = Number(airport.properties?.routeCount ?? 0);
        setHover({ kind: 'airport', title: `${iata} · ${city}`, subtitle: `${routeCount} ${locale === 'zh-TW' ? '條相關航線' : 'routes'}`, x: event.point.x, y: event.point.y });
        return;
      }
      if (route) {
        canvas.style.cursor = 'pointer';
        const id = String(route.properties?.routeId ?? '');
        const distance = Number(route.properties?.distanceNm ?? 0);
        const carriers = String(route.properties?.carriers ?? '');
        setHover({ kind: 'route', title: id.replace('-', ' → '), subtitle: `${distance.toLocaleString()} nm · ${carriers}`, x: event.point.x, y: event.point.y });
        return;
      }
      canvas.style.cursor = '';
      setHover(null);
    };
    const onMapClick = (event: maplibregl.MapMouseEvent): void => {
      const { cluster, airport, route } = featuresAt(event.point);
      if (cluster && cluster.geometry.type === 'Point') {
        const clusterId = Number(cluster.properties?.cluster_id);
        const clusterSource = source(map, AIRPORT_SOURCE);
        const [lon, lat] = cluster.geometry.coordinates as [number, number];
        if (clusterSource && Number.isFinite(clusterId)) {
          void clusterSource.getClusterExpansionZoom(clusterId).then((zoom) => {
            map.easeTo({ center: [lon, lat], zoom: Math.min(zoom + 0.35, 11), duration: 420 });
          });
        }
        return;
      }
      if (airport) {
        const iata = String(airport.properties?.iata ?? '');
        if (iata) focusSelection({ kind: 'airport', iata });
        return;
      }
      if (route) {
        const routeId = String(route.properties?.routeId ?? '');
        if (routeId) focusSelection({ kind: 'route', routeId });
        return;
      }
      setSelection(null);
      setFocusSources(map, model, null);
    };

    map.on('mousemove', onMapMove);
    map.on('mouseout', () => { canvas.style.cursor = ''; setHover(null); });
    map.on('click', onMapClick);
    return () => {
      map.off('mousemove', onMapMove);
      map.off('click', onMapClick);
    };
  }, [copy.clusters, copy.zoomCluster, focusSelection, locale, model, ready]);

  const activeAirport = selection?.kind === 'airport' ? model.airportByIata.get(selection.iata) ?? null : null;
  const activeRoutes = inspectorRoutes(model, selection);
  const activeRoute = selection?.kind === 'route' ? model.routeById.get(selection.routeId) ?? null : null;

  return (
    <div ref={cardRef} className={`entity-map-card maplibre-route-map alliance-${allianceTheme}${fingerprint ? ' fingerprint' : ''}`} data-map-engine="maplibre" data-map-ready={ready ? 'true' : 'false'} data-map-routes={model.routes.features.length} data-map-airports={model.airports.features.length} data-map-alliance={allianceTheme} data-map-mode={fingerprint ? 'fingerprint' : 'detail'}>
      <div ref={containerRef} className="entity-map-maplibre" role="application" aria-label="Route network map" />
      {!webGlAvailable && <div className="entity-map-fallback">{copy.fallback}</div>}
      {controls && <div className="entity-map-commandbar">
        <div className="entity-map-alliance-filter" role="group" aria-label="Alliance filter">
          {(['all', 'star', 'oneworld', 'skyteam'] as const).map((value) => <button
            type="button"
            key={value}
            className={controls.alliance === value ? 'active' : ''}
            aria-pressed={controls.alliance === value}
            onClick={() => controls.onAllianceChange(value)}
          >{value === 'all' ? copy.all : value === 'star' ? 'Star' : value === 'oneworld' ? 'oneworld' : 'SkyTeam'}</button>)}
        </div>
        <div className="entity-map-search-wrap">
          <label className="entity-map-search">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={controls.query} onFocus={() => controls.onSearchOpenChange(controls.query.length > 0)} onChange={(event) => controls.onQueryChange(event.target.value)} placeholder={controls.searchPlaceholder} aria-label={controls.searchPlaceholder} />
            {controls.query && <button type="button" aria-label={locale === 'zh-TW' ? '清除搜尋' : 'Clear search'} onClick={() => { controls.onQueryChange(''); controls.onSearchOpenChange(false); }}>×</button>}
          </label>
          {controls.query && controls.searchOpen && <div className="entity-map-search-results" role="listbox">
            {controls.searchResults.length > 0 ? controls.searchResults.map((result) => <button type="button" role="option" key={result.key} onClick={() => { controls.onSearchOpenChange(false); controls.onSearchResultSelect(result.selection); }}><span>{result.kind}</span><strong>{result.title}</strong><small>{result.subtitle}</small></button>) : <p>{locale === 'zh-TW' ? '沒有符合的結果' : 'No matching result'}</p>}
          </div>}
        </div>
      </div>}
      {stats.length > 0 && <div className="entity-map-stats">{stats.map((stat) => <div key={stat.label}><strong>{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</strong><span>{stat.label}</span></div>)}</div>}
      {fingerprint && hubs.length > 0 && <div className="entity-map-fingerprint-key" aria-label={copy.coreHubs}>
        <span>{copy.coreHubs}</span>
        <strong>{hubs.slice(0, 4).map((hub) => hub.airport.iata).join(' · ')}</strong>
      </div>}
      {ready && <button type="button" className="entity-map-fit-network" onClick={() => {
        const map = mapRef.current;
        const container = containerRef.current;
        if (!map || !container) return;
        setSelection(null);
        setFocusSources(map, model, null);
        fitModel(map, container, model, routes, selectedAirport);
      }}>{copy.fit}</button>}
      {hover && <div className="entity-map-hover" style={{ left: hover.x, top: hover.y }}><strong>{hover.title}</strong><span>{hover.subtitle}</span></div>}
      {selection && <aside className="entity-map-inspector" aria-live="polite">
        <header>
          <div>
            <code>{activeRoute ? `${activeRoute.from.iata}→${activeRoute.to.iata}` : activeAirport?.iata}</code>
            <strong>{activeRoute ? `${activeRoute.from.city} → ${activeRoute.to.city}` : activeAirport?.city}</strong>
          </div>
          <button type="button" aria-label="Close" onClick={() => {
            setSelection(null);
            const map = mapRef.current;
            if (map) setFocusSources(map, model, null);
          }}>×</button>
        </header>
        {activeAirport && <p>{activeAirport.name}</p>}
        {activeRoutes.length > 0 && <div className="entity-map-inspector-routes">
          {activeRoutes.slice(0, 6).map((route) => {
            const carriers = route.carriers.map((carrier) => carrier.carrier).join(' · ');
            const numbers = route.carriers.flatMap((carrier) => carrier.confirmedNumbers).slice(0, 8);
            return <div key={`${route.from.iata}-${route.to.iata}`}>
              <span><code>{route.from.iata}</code> → <code>{route.to.iata}</code><b>{route.distanceNm.toLocaleString()} nm</b></span>
              <small>{carriers}</small>
              <em>{numbers.length > 0 ? `${copy.confirmed}: ${numbers.join(' · ')}` : copy.noConfirmed}</em>
              {onRouteSelect && <button type="button" onClick={() => onRouteSelect(`${route.from.iata}-${route.to.iata}`)}>{copy.route}</button>}
            </div>;
          })}
        </div>}
        {activeAirport && <button type="button" className="entity-map-airport-action" onClick={() => onAirportSelect(activeAirport)}>{copy.airport}</button>}
      </aside>}
    </div>
  );
}
