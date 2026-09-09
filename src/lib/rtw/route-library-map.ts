import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from 'geojson';
import { greatCirclePath } from '../calc/haversine.ts';
import type { Airport } from '../types.ts';
import type { RouteLibraryRouteCard } from './route-library-entities.ts';

export interface RouteMapAirportProperties {
  readonly iata: string;
  readonly city: string;
  readonly name: string;
  readonly connections: number;
  readonly routeCount: number;
  readonly hubRank: number;
}

export interface RouteMapRouteProperties {
  readonly routeId: string;
  readonly from: string;
  readonly to: string;
  readonly distanceNm: number;
  readonly carriers: string;
  readonly confirmedNumbers: string;
  readonly importance: number;
}

export interface RouteMapModel {
  readonly airports: FeatureCollection<Point, RouteMapAirportProperties>;
  readonly routes: FeatureCollection<LineString | MultiLineString, RouteMapRouteProperties>;
  readonly routeById: ReadonlyMap<string, RouteLibraryRouteCard>;
  readonly routeFeatureById: ReadonlyMap<string, Feature<LineString | MultiLineString, RouteMapRouteProperties>>;
  readonly routesByAirport: ReadonlyMap<string, ReadonlyArray<RouteLibraryRouteCard>>;
  readonly airportByIata: ReadonlyMap<string, Airport>;
}

export type RouteMapBounds = readonly [readonly [number, number], readonly [number, number]];

function routeId(route: RouteLibraryRouteCard): string {
  return `${route.from.iata}-${route.to.iata}`;
}

function sampleCount(routeCount: number): number {
  if (routeCount > 1_500) return 7;
  if (routeCount > 800) return 9;
  if (routeCount > 320) return 12;
  if (routeCount > 120) return 16;
  if (routeCount > 40) return 24;
  return 40;
}

function splitAtAntimeridian(points: ReadonlyArray<readonly [number, number]>): ReadonlyArray<ReadonlyArray<readonly [number, number]>> {
  if (points.length < 2) return [points];
  const segments: Array<Array<readonly [number, number]>> = [[points[0]!]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const delta = current[0] - previous[0];
    const segment = segments[segments.length - 1]!;
    if (Math.abs(delta) <= 180) {
      segment.push(current);
      continue;
    }

    const adjustedLon = delta > 180 ? current[0] - 360 : current[0] + 360;
    const boundary = adjustedLon > previous[0] ? 180 : -180;
    const denominator = adjustedLon - previous[0];
    const t = denominator === 0 ? 0.5 : (boundary - previous[0]) / denominator;
    const boundaryLat = previous[1] + (current[1] - previous[1]) * t;
    segment.push([boundary, boundaryLat]);
    segments.push([[-boundary, boundaryLat], current]);
  }
  return segments.filter((segment) => segment.length >= 2);
}

function routeFeature(route: RouteLibraryRouteCard, count: number, importance: number): Feature<LineString | MultiLineString, RouteMapRouteProperties> {
  const points = greatCirclePath(route.from, route.to, sampleCount(count)).map((point): [number, number] => [point.lon, point.lat]);
  const segments = splitAtAntimeridian(points);
  const geometry: LineString | MultiLineString = segments.length <= 1
    ? { type: 'LineString', coordinates: [...(segments[0] ?? points)].map(([lon, lat]) => [lon, lat]) }
    : { type: 'MultiLineString', coordinates: segments.map((segment) => segment.map(([lon, lat]) => [lon, lat])) };
  return {
    type: 'Feature',
    geometry,
    properties: {
      routeId: routeId(route),
      from: route.from.iata,
      to: route.to.iata,
      distanceNm: route.distanceNm,
      carriers: route.carriers.map((carrier) => carrier.carrier).join(' · '),
      confirmedNumbers: route.carriers.flatMap((carrier) => carrier.confirmedNumbers).slice(0, 8).join(' · '),
      importance,
    },
  };
}

export function buildRouteMapModel(
  routes: ReadonlyArray<RouteLibraryRouteCard>,
  hubs: ReadonlyArray<{ readonly airport: Airport; readonly connections: number }>,
): RouteMapModel {
  const routeById = new Map<string, RouteLibraryRouteCard>();
  const airportByIata = new Map<string, Airport>();
  const routesByAirportMutable = new Map<string, RouteLibraryRouteCard[]>();
  const connections = new Map<string, number>();
  const hubRank = new Map(hubs.map((hub, index) => [hub.airport.iata, index] as const));

  const addRouteForAirport = (airport: Airport, route: RouteLibraryRouteCard): void => {
    airportByIata.set(airport.iata, airport);
    const rows = routesByAirportMutable.get(airport.iata) ?? [];
    if (!rows.some((row) => routeId(row) === routeId(route))) rows.push(route);
    routesByAirportMutable.set(airport.iata, rows);
    connections.set(airport.iata, (connections.get(airport.iata) ?? 0) + 1);
  };

  for (const route of routes) {
    routeById.set(routeId(route), route);
    addRouteForAirport(route.from, route);
    addRouteForAirport(route.to, route);
  }
  for (const hub of hubs) {
    airportByIata.set(hub.airport.iata, hub.airport);
    connections.set(hub.airport.iata, Math.max(connections.get(hub.airport.iata) ?? 0, hub.connections));
  }

  const airportFeatures: Array<Feature<Point, RouteMapAirportProperties>> = [...airportByIata.values()].map((airport) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [airport.lon, airport.lat] },
    properties: {
      iata: airport.iata,
      city: airport.city,
      name: airport.name,
      connections: connections.get(airport.iata) ?? 0,
      routeCount: routesByAirportMutable.get(airport.iata)?.length ?? 0,
      hubRank: hubRank.get(airport.iata) ?? 999,
    },
  }));

  const rawImportance = routes.map((route) => {
    const fromDegree = Math.max(1, connections.get(route.from.iata) ?? 1);
    const toDegree = Math.max(1, connections.get(route.to.iata) ?? 1);
    return Math.sqrt(fromDegree * toDegree) * (1 + Math.min(route.distanceNm / 3_500, 1.7));
  });
  const maxImportance = Math.max(1, ...rawImportance);
  const routeFeatures = routes.map((route, index) => routeFeature(route, routes.length, (rawImportance[index] ?? 0) / maxImportance));
  return {
    airports: { type: 'FeatureCollection', features: airportFeatures },
    routes: { type: 'FeatureCollection', features: routeFeatures },
    routeById,
    routeFeatureById: new Map(routeFeatures.map((feature) => [feature.properties.routeId, feature] as const)),
    routesByAirport: new Map([...routesByAirportMutable.entries()].map(([iata, rows]) => [iata, rows] as const)),
    airportByIata,
  };
}

export interface RouteMapScreenPoint {
  readonly x: number;
  readonly y: number;
}

function pointSegmentDistanceSquared(point: RouteMapScreenPoint, start: RouteMapScreenPoint, end: RouteMapScreenPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const t = Math.max(0, Math.min(1, projection));
  const x = start.x + dx * t;
  const y = start.y + dy * t;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}

function routeGeometryLines(feature: Feature<LineString | MultiLineString, RouteMapRouteProperties>): ReadonlyArray<ReadonlyArray<readonly [number, number]>> {
  return feature.geometry.type === 'LineString'
    ? [feature.geometry.coordinates as Array<[number, number]>]
    : feature.geometry.coordinates as Array<Array<[number, number]>>;
}

export function nearestRouteIdByScreenDistance(
  model: RouteMapModel,
  candidateRouteIds: ReadonlyArray<string>,
  point: RouteMapScreenPoint,
  project: (lon: number, lat: number) => RouteMapScreenPoint,
  maxDistancePx = Number.POSITIVE_INFINITY,
): string | null {
  let best: { routeId: string; distanceSquared: number } | null = null;
  for (const routeIdValue of new Set(candidateRouteIds)) {
    const feature = model.routeFeatureById.get(routeIdValue);
    if (!feature) continue;
    let routeDistanceSquared = Number.POSITIVE_INFINITY;
    for (const line of routeGeometryLines(feature)) {
      if (line.length < 2) continue;
      for (const worldOffset of [-360, 0, 360]) {
        let previous = project(line[0]![0] + worldOffset, line[0]![1]);
        for (let index = 1; index < line.length; index += 1) {
          const coordinate = line[index]!;
          const current = project(coordinate[0] + worldOffset, coordinate[1]);
          routeDistanceSquared = Math.min(routeDistanceSquared, pointSegmentDistanceSquared(point, previous, current));
          previous = current;
        }
      }
    }
    if (!best || routeDistanceSquared < best.distanceSquared) best = { routeId: routeIdValue, distanceSquared: routeDistanceSquared };
  }
  return best && best.distanceSquared <= maxDistancePx * maxDistancePx ? best.routeId : null;
}

function unwrapLongitude(lon: number, anchor: number): number {
  let value = lon;
  while (value - anchor > 180) value -= 360;
  while (anchor - value > 180) value += 360;
  return value;
}

function featureCoordinates(feature: Feature<LineString | MultiLineString, RouteMapRouteProperties>): ReadonlyArray<readonly [number, number]> {
  if (feature.geometry.type === 'LineString') return feature.geometry.coordinates as Array<[number, number]>;
  return feature.geometry.coordinates.flat() as Array<[number, number]>;
}

export function routeMapBounds(
  model: RouteMapModel,
  routeIds?: ReadonlySet<string> | null,
  airportIatas?: ReadonlySet<string> | null,
  anchorLon?: number,
): RouteMapBounds | null {
  const anchor = anchorLon
    ?? [...(airportIatas ?? [])].map((iata) => model.airportByIata.get(iata)?.lon).find((lon): lon is number => lon !== undefined)
    ?? model.airports.features[0]?.geometry.coordinates[0]
    ?? 0;
  const coordinates: Array<readonly [number, number]> = [];
  for (const feature of model.routes.features) {
    if (routeIds && !routeIds.has(feature.properties.routeId)) continue;
    coordinates.push(...featureCoordinates(feature));
  }
  for (const feature of model.airports.features) {
    if (airportIatas && !airportIatas.has(feature.properties.iata)) continue;
    coordinates.push(feature.geometry.coordinates as [number, number]);
  }
  if (coordinates.length === 0) return null;
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const [rawLon, lat] of coordinates) {
    const lon = unwrapLongitude(rawLon, anchor);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}
