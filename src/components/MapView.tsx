/**
 * Interactive SVG world map.
 *
 *   - 4 projections (Mercator, Equirectangular, Azimuthal Equidistant, Orthographic)
 *
 *   - **Wrapping 2D mode** (Mercator + Equirectangular):
 *       drag  → pan SVG transform (unbounded; tx normalized modulo worldWidth)
 *       wheel → zoom SVG transform toward cursor
 *       The world is rendered 3 times horizontally (-worldWidth, 0, +worldWidth)
 *       so a leg that crosses the antimeridian appears continuous on both
 *       sides of the seam — and panning past one edge wraps seamlessly into
 *       the other side, Google-Maps-style.
 *
 *   - **Globe mode** (Orthographic):
 *       drag  → rotate the projection (degrees per pixel, scales with zoom)
 *       wheel → zoom the projection scale (stays a clean sphere)
 *
 *   - **Azimuthal Equidistant**: same as flat — pan SVG, zoom SVG.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { geoGraticule, geoPath, type GeoPath, type GeoProjection } from 'd3-geo';
import { groupColor } from '../lib/group-colors.ts';
import { useLocale } from '../i18n/use-locale.ts';
import { distanceNm } from '../lib/calc/haversine.ts';
import { greatCircleSvgPathProjected } from '../lib/calc/svg-arc.ts';
import {
  buildProjection,
  isWrappingProjection,
  type ProjectionId,
} from '../lib/calc/projections.ts';
import { clusterMapPoints, fitProjectedPoints, layoutMapLabels } from '../lib/map-layout.ts';
import type { NextLegMapGuide } from '../lib/rtw/next-leg-discovery.ts';
import type { Airport, RoutingGroup } from '../lib/types.ts';
import { useWorldMap } from '../state/use-world-map.ts';

interface Props {
  airportLookup: ReadonlyMap<string, Airport>;
  airports: ReadonlyArray<Airport>;
  activeAirports: ReadonlyArray<Airport>;
  groups: ReadonlyArray<RoutingGroup>;
  activeIndex: number;
  width: number;
  height: number;
  projection: ProjectionId;
  /**
   * Show "N nm" distance labels at each arc midpoint. v1.8 — gcmap forces
   * mileage runners into a sidebar table to see distances; this puts them
   * on the line itself.
   */
  showDistances?: boolean;
  onAirportCommit?: (airport: Airport) => void;
  nextLegGuide?: NextLegMapGuide | null;
  /** Selected next destination shared with the left route editor. Undefined
   * keeps MapView usable standalone with local selection state. */
  selectedNextStop?: string | null | undefined;
  onNextLegSelect?: (destination: string | null) => void;
}

/** Pan/zoom state for flat projections — applied as an SVG transform. */
interface PanZoomState {
  scale: number;
  tx: number;
  ty: number;
}

const PAN_IDENTITY: PanZoomState = { scale: 1, tx: 0, ty: 0 };

/** Globe state for orthographic — applied to the d3 projection. */
interface GlobeState {
  rotateLon: number;
  rotateLat: number;
  scale: number;
}

interface ProjectedAirport {
  readonly airport: Airport;
  readonly x: number | null;
  readonly y: number | null;
}

const GLOBE_IDENTITY: GlobeState = { rotateLon: 0, rotateLat: 0, scale: 1 };

/**
 * Normalize a horizontal translate into [-period/2, +period/2] so the user
 * can pan unboundedly without tx growing forever. The 3-copy render below
 * makes this wrap invisible: every (tx + N×period) produces the same image.
 */
function normalizeTx(tx: number, period: number): number {
  if (period <= 0) return tx;
  const halved = ((tx + period / 2) % period + period) % period;
  return halved - period / 2;
}

function airportDotPath(
  airports: ReadonlyArray<ProjectedAirport>,
  routeCodes: ReadonlySet<string>,
  radius: number,
): string {
  return airports
    .filter(({ airport, x, y }) => x !== null && y !== null && !routeCodes.has(airport.iata))
    .map(({ x, y }) => {
      const cx = x as number;
      const cy = y as number;
      return `M${(cx - radius).toFixed(2)} ${cy.toFixed(2)}a${radius} ${radius} 0 1 0 ${(radius * 2).toFixed(2)} 0a${radius} ${radius} 0 1 0 ${(-radius * 2).toFixed(2)} 0`;
    })
    .join('');
}

export function MapView({
  airportLookup,
  airports,
  activeAirports,
  groups,
  activeIndex,
  width,
  height,
  projection,
  showDistances = false,
  onAirportCommit,
  nextLegGuide = null,
  selectedNextStop: controlledNextStop,
  onNextLegSelect,
}: Props): React.ReactElement {
  const { locale } = useLocale();
  const { features, error: worldError } = useWorldMap();

  const isGlobe = projection === 'orthographic';
  const wrapping = isWrappingProjection(projection);

  // Center on first airport in the active chain (initial default for non-globe;
  // initial rotation for globe).
  const initialCenter = useMemo<{ lat: number; lon: number }>(() => {
    const activeGroup = groups[activeIndex] ?? groups[0];
    const firstLeg = activeGroup?.legs[0];
    if (!firstLeg) return { lat: 0, lon: 0 };
    const first = airportLookup.get(firstLeg.from);
    if (!first) return { lat: 0, lon: 0 };
    return { lat: first.lat, lon: first.lon };
  }, [groups, activeIndex, airportLookup]);

  const [pz, setPz] = useState<PanZoomState>(PAN_IDENTITY);
  const [globe, setGlobe] = useState<GlobeState>({
    ...GLOBE_IDENTITY,
    rotateLon: initialCenter.lon,
    rotateLat: initialCenter.lat,
  });
  const [dragging, setDragging] = useState(false);
  const [selectedAirportCode, setSelectedAirportCode] = useState<string | null>(null);
  const [localNextStopCode, setLocalNextStopCode] = useState<string | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastAutoFitKeyRef = useRef<string | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originPz: PanZoomState;
    originGlobe: GlobeState;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const proj = useMemo<GeoProjection>(() => {
    if (isGlobe) {
      return buildProjection(projection, {
        width,
        height,
        centerLat: globe.rotateLat,
        centerLon: globe.rotateLon,
        scale: globe.scale,
      });
    }
    return buildProjection(projection, {
      width,
      height,
      centerLat: initialCenter.lat,
      centerLon: initialCenter.lon,
    });
  }, [
    projection,
    isGlobe,
    width,
    height,
    globe.rotateLat,
    globe.rotateLon,
    globe.scale,
    initialCenter.lat,
    initialCenter.lon,
  ]);

  // Cylindrical projections repeat every 360°. Their projected period is
  // 2π × projection scale — it is NOT necessarily the viewport width.
  // Mercator in a wide viewport is commonly height-constrained (for example,
  // an 800×500 viewport has a ~500px world period). Using `width` here leaves
  // a visible Pacific gap and also breaks antimeridian route unwrapping.
  const worldWidth = wrapping ? 2 * Math.PI * proj.scale() : width;

  const pathBuilder = useMemo<GeoPath>(() => geoPath(proj), [proj]);

  const worldPath = useMemo<string>(
    () => (features ? (pathBuilder(features) ?? '') : ''),
    [features, pathBuilder],
  );

  const graticulePath = useMemo<string>(
    () => pathBuilder(geoGraticule().step([45, 30])()) ?? '',
    [pathBuilder],
  );

  const spherePath = useMemo<string>(
    () => pathBuilder({ type: 'Sphere' as const }) ?? '',
    [pathBuilder],
  );

  // Arcs per group.
  const arcsByGroup = useMemo(() => {
    return groups.map((group, gi) => {
      return group.legs.map((leg, i) => {
        const from = airportLookup.get(leg.from);
        const to = airportLookup.get(leg.to);
        if (!from || !to) return null;
        const d = greatCircleSvgPathProjected(from, to, proj, 96, {
          ...(wrapping ? { wrapWidth: worldWidth } : {}),
        });
        const midLat = (from.lat + to.lat) / 2;
        const midLon = (from.lon + to.lon) / 2;
        const midProj = proj([midLon, midLat]);
        const distNm = Math.round(distanceNm(from, to));
        return {
          d,
          key: `${gi}-${leg.from}-${leg.to}-${i}`,
          color: groupColor(gi),
          groupIndex: gi,
          from: leg.from,
          to: leg.to,
          surface: leg.surface === true,
          mid:
            midProj && Number.isFinite(midProj[0]) && Number.isFinite(midProj[1])
              ? { x: midProj[0], y: midProj[1] }
              : null,
          distanceNm: distNm,
        };
      });
    });
  }, [groups, airportLookup, proj, wrapping, worldWidth]);

  const routeAirports = useMemo(() => {
    const seen = new Set<string>();
    const out: Airport[] = [];
    for (const g of groups) {
      for (const leg of g.legs) {
        for (const code of [leg.from, leg.to]) {
          if (seen.has(code)) continue;
          const airport = airportLookup.get(code);
          if (airport) {
            out.push(airport);
            seen.add(code);
          }
        }
      }
    }
    return out;
  }, [groups, airportLookup]);

  const activeAirportCodes = useMemo(
    () => new Set(activeAirports.map((airport) => airport.iata)),
    [activeAirports],
  );
  const activeWaypointLabels = useMemo(() => {
    const positions = new Map<string, number[]>();
    activeAirports.forEach((airport, index) => {
      const rows = positions.get(airport.iata) ?? [];
      rows.push(index + 1);
      positions.set(airport.iata, rows);
    });
    return new Map(
      [...positions.entries()].map(([iata, rows]) => [
        iata,
        {
          label: `${rows.join('/')} ${iata}`,
          firstPosition: rows[0] ?? 1,
        },
      ] as const),
    );
  }, [activeAirports]);
  const routeAirportCodes = useMemo(
    () => new Set(routeAirports.map((airport) => airport.iata)),
    [routeAirports],
  );
  const routeEndpoint = activeAirports.at(-1) ?? null;
  const routeOrigin = activeAirports[0] ?? null;
  const activeNextLegGuide = nextLegGuide && routeEndpoint?.iata === nextLegGuide.origin
    ? nextLegGuide
    : null;
  const selectedNextStopCode = controlledNextStop !== undefined
    ? controlledNextStop
    : localNextStopCode;
  function chooseNextStop(code: string | null): void {
    if (controlledNextStop === undefined) setLocalNextStopCode(code);
    onNextLegSelect?.(code);
  }

  const projectedAirports = useMemo(() => {
    return airports.map((a) => {
      const coords = proj([a.lon, a.lat]);
      if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
        return { airport: a, x: null as number | null, y: null as number | null };
      }
      return { airport: a, x: coords[0], y: coords[1] };
    });
  }, [airports, proj]);
  const labelInvScale = isGlobe ? Math.max(globe.scale, 1) : Math.max(pz.scale, 1);

  const selectedAirport = useMemo(() => {
    if (!selectedAirportCode) return null;
    return airports.find((airport) => airport.iata === selectedAirportCode) ?? null;
  }, [airports, selectedAirportCode]);

  const selectedProjected = useMemo(() => {
    if (!selectedAirport) return null;
    const coords = proj([selectedAirport.lon, selectedAirport.lat]);
    if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
    return { airport: selectedAirport, x: coords[0], y: coords[1] };
  }, [selectedAirport, proj]);
  const availableNextStops = useMemo(() => {
    if (!activeNextLegGuide) return [];
    return activeNextLegGuide.destinations.flatMap((destination) => {
      const airport = airportLookup.get(destination.iata);
      if (!airport) return [];
      const coords = proj([airport.lon, airport.lat]);
      if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return [];
      return [{ destination, airport, x: coords[0], y: coords[1] }];
    });
  }, [activeNextLegGuide, airportLookup, proj]);
  const nextLegOrigin = useMemo(() => {
    if (!activeNextLegGuide) return null;
    const airport = airportLookup.get(activeNextLegGuide.origin);
    if (!airport) return null;
    const coords = proj([airport.lon, airport.lat]);
    if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
    return { airport, x: coords[0], y: coords[1] };
  }, [activeNextLegGuide, airportLookup, proj]);
  const selectedNextStop = useMemo(
    () => availableNextStops.find((stop) => stop.airport.iata === selectedNextStopCode) ?? null,
    [availableNextStops, selectedNextStopCode],
  );
  const selectedNextStopPreview = useMemo(() => {
    if (!selectedNextStop || !routeEndpoint) return null;
    return greatCircleSvgPathProjected(routeEndpoint, selectedNextStop.airport, proj, 96, {
      ...(wrapping ? { wrapWidth: worldWidth } : {}),
    });
  }, [selectedNextStop, routeEndpoint, proj, wrapping, worldWidth]);
  const autoFitMode = selectedNextStop
    ? 'selection'
    : activeNextLegGuide && availableNextStops.length > 12
      ? 'network'
      : 'route';
  const autoFitAirports = useMemo(() => {
    if (autoFitMode === 'network') return [];
    const candidates = selectedNextStop
      ? [...activeAirports, selectedNextStop.airport]
      : [...activeAirports];
    const seen = new Set<string>();
    return candidates.filter((airport) => {
      if (seen.has(airport.iata)) return false;
      seen.add(airport.iata);
      return true;
    });
  }, [activeAirports, autoFitMode, selectedNextStop]);
  const preferredPanZoom = useMemo<PanZoomState>(() => {
    if (isGlobe || autoFitMode === 'network') return PAN_IDENTITY;
    const points = autoFitAirports.flatMap((airport) => {
      const coords = proj([airport.lon, airport.lat]);
      if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return [];
      return [{ id: airport.iata, x: coords[0], y: coords[1] }];
    });
    const fit = fitProjectedPoints(points, { width, height }, {
      padding: { top: 74, right: 52, bottom: 58, left: 52 },
      maxScale: autoFitMode === 'selection' ? 4.2 : 3.6,
      ...(wrapping ? { wrapWidth: worldWidth } : {}),
    });
    return fit ?? PAN_IDENTITY;
  }, [autoFitAirports, autoFitMode, height, isGlobe, proj, width, worldWidth, wrapping]);
  const autoFitKey = `${projection}:${width}x${height}:${autoFitMode}:${autoFitAirports.map((airport) => airport.iata).join('-')}`;

  useEffect(() => {
    if (isGlobe || lastAutoFitKeyRef.current === autoFitKey) return;
    lastAutoFitKeyRef.current = autoFitKey;
    setPz(preferredPanZoom);
  }, [autoFitKey, isGlobe, preferredPanZoom]);
  const mapDetailScale = isGlobe
    ? globe.scale
    : pz.scale / Math.max(0.01, preferredPanZoom.scale);
  // Auto-fitting a route is still the overview. Reveal the global airport
  // cloud only after the user zooms materially beyond that fitted view.
  const showBackgroundAirports = activeNextLegGuide === null && mapDetailScale >= 1.8;
  const airportDotsPath = useMemo(
    () => showBackgroundAirports
      ? airportDotPath(projectedAirports, routeAirportCodes, 1.15 / labelInvScale)
      : '',
    [projectedAirports, routeAirportCodes, labelInvScale, showBackgroundAirports],
  );

  function airportActionLabel(airport: Airport): string {
    if (!routeEndpoint) return `Start route at ${airport.iata}`;
    if (routeEndpoint.iata === airport.iata) return `${airport.iata} is current endpoint`;
    if (routeOrigin && airport.iata === routeOrigin.iata && activeAirports.length > 1) {
      return `Close loop ${routeEndpoint.iata} → ${airport.iata}`;
    }
    return `Add leg ${routeEndpoint.iata} → ${airport.iata}`;
  }

  function airportCanCommit(airport: Airport): boolean {
    return routeEndpoint?.iata !== airport.iata;
  }

  function findNearestAirportAt(svgX: number, svgY: number): Airport | null {
    const hitRadiusPx = 9;
    const hitRadiusSq = hitRadiusPx * hitRadiusPx;
    let best: { airport: Airport; distSq: number } | null = null;
    for (const { airport, x, y } of projectedAirports) {
      if (x === null || y === null) continue;
      if (activeNextLegGuide) {
        if (!routeAirportCodes.has(airport.iata)) continue;
      } else if (!showBackgroundAirports && !routeAirportCodes.has(airport.iata)) continue;
      for (const offsetX of wrapOffsets) {
        const screenX = isGlobe ? x : (x + offsetX) * pz.scale + pz.tx;
        const screenY = isGlobe ? y : y * pz.scale + pz.ty;
        const dx = screenX - svgX;
        const dy = screenY - svgY;
        const distSq = dx * dx + dy * dy;
        if (distSq <= hitRadiusSq && (best === null || distSq < best.distSq)) {
          best = { airport, distSq };
        }
      }
    }
    return best?.airport ?? null;
  }

  function updateHoveredAirport(e: React.PointerEvent<SVGSVGElement>): void {
    if (dragRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    lastPointerRef.current = {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
    if (hoverFrameRef.current !== null) return;
    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = null;
      const last = lastPointerRef.current;
      if (!last) return;
      const nearest = findNearestAirportAt(last.x, last.y);
      setSelectedAirportCode((current) => {
        const next = nearest?.iata ?? null;
        return current === next ? current : next;
      });
    });
  }

  // ── Interaction ──

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>): void {
    if (e.button !== 0) return;
    setSelectedAirportCode(null);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originPz: pz,
      originGlobe: globe,
    };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>): void {
    const d = dragRef.current;
    if (!d) {
      updateHoveredAirport(e);
      return;
    }
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (isGlobe) {
      const sensitivity = 0.5 / d.originGlobe.scale;
      const nextLon = d.originGlobe.rotateLon + dx * sensitivity;
      const nextLat = Math.max(
        -90,
        Math.min(90, d.originGlobe.rotateLat - dy * sensitivity),
      );
      setGlobe({ ...d.originGlobe, rotateLon: nextLon, rotateLat: nextLat });
    } else {
      const nextTxRaw = d.originPz.tx + dx;
      const period = wrapping ? worldWidth * d.originPz.scale : Infinity;
      const nextTx = wrapping ? normalizeTx(nextTxRaw, period) : nextTxRaw;
      setPz({
        scale: d.originPz.scale,
        tx: nextTx,
        ty: d.originPz.ty + dy,
      });
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>): void {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
    setDragging(false);
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>): void {
    e.preventDefault();
    if (isGlobe) {
      setGlobe((prev) => {
        const factor = Math.exp(-e.deltaY * 0.001);
        return { ...prev, scale: Math.max(0.5, Math.min(6, prev.scale * factor)) };
      });
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setPz((prev) => {
      const factor = Math.exp(-e.deltaY * 0.001);
      const nextScale = Math.max(0.4, Math.min(8, prev.scale * factor));
      const worldX = (px - prev.tx) / prev.scale;
      const worldY = (py - prev.ty) / prev.scale;
      let nextTx = px - worldX * nextScale;
      const nextTy = py - worldY * nextScale;
      if (wrapping) {
        nextTx = normalizeTx(nextTx, worldWidth * nextScale);
      }
      return { scale: nextScale, tx: nextTx, ty: nextTy };
    });
  }

  function resetView(): void {
    if (isGlobe) {
      setGlobe({ rotateLon: initialCenter.lon, rotateLat: initialCenter.lat, scale: 1 });
    } else {
      setPz(preferredPanZoom);
    }
  }

  const transform = isGlobe ? '' : `translate(${pz.tx}, ${pz.ty}) scale(${pz.scale})`;

  const isTransformed = isGlobe
    ? globe.rotateLon !== initialCenter.lon ||
      globe.rotateLat !== initialCenter.lat ||
      globe.scale !== 1
    : Math.abs(pz.scale - preferredPanZoom.scale) > 0.001 ||
      Math.abs(pz.tx - preferredPanZoom.tx) > 0.5 ||
      Math.abs(pz.ty - preferredPanZoom.ty) > 0.5;

  // Render enough periodic copies to cover the viewport even at the minimum
  // zoom. A fixed 3-copy strip is insufficient when the user zooms out because
  // the on-screen period becomes narrower than the viewport.
  const wrapOffsets = (() => {
    if (!wrapping) return [0];
    const screenPeriod = Math.max(1, worldWidth * pz.scale);
    const eachSide = Math.max(1, Math.ceil((width / screenPeriod + 1) / 2));
    return Array.from({ length: eachSide * 2 + 1 }, (_, index) =>
      (index - eachSide) * worldWidth,
    );
  })();
  function projectedToScreen(x: number, y: number): { x: number; y: number } | null {
    if (isGlobe) return { x, y };
    const candidates = wrapOffsets.map((offsetX) => ({
      x: (x + offsetX) * pz.scale + pz.tx,
      y: y * pz.scale + pz.ty,
    }));
    return candidates
      .filter((point) => point.x >= -40 && point.x <= width + 40 && point.y >= -40 && point.y <= height + 40)
      .sort((a, b) => Math.abs(a.x - width / 2) - Math.abs(b.x - width / 2))[0]
      ?? candidates.sort((a, b) => Math.abs(a.x - width / 2) - Math.abs(b.x - width / 2))[0]
      ?? null;
  }
  const selectedNextStopScreen = selectedNextStop
    ? projectedToScreen(selectedNextStop.x, selectedNextStop.y)
    : null;
  const mapDetailLevel = mapDetailScale >= 2.6 ? 'local' : mapDetailScale >= 1.45 ? 'regional' : 'overview';
  const labelLayoutScale = isGlobe ? 1 : Math.max(0.01, pz.scale);
  const waypointLabelLayout = layoutMapLabels(
    [...activeWaypointLabels.entries()].flatMap(([iata, waypoint]) => {
      const airport = airportLookup.get(iata);
      if (!airport) return [];
      const coords = proj([airport.lon, airport.lat]);
      if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return [];
      const screen = projectedToScreen(coords[0], coords[1]);
      if (!screen) return [];
      const widthPx = Math.max(48, waypoint.label.length * 7 + 16);
      return [{ id: iata, x: screen.x, y: screen.y, width: widthPx, height: 20 }];
    }),
    { width, height },
    { gap: 9, viewportPadding: 12 },
  );
  const nextStopScreenPoints = availableNextStops.flatMap((stop) => {
    const screen = projectedToScreen(stop.x, stop.y);
    if (!screen) return [];
    return [{ id: stop.airport.iata, x: screen.x, y: screen.y, stop }];
  });
  const clusterRadius = mapDetailLevel === 'overview' ? 26 : mapDetailLevel === 'regional' ? 17 : 0;
  const nextStopClusters = activeNextLegGuide
    ? clusterMapPoints(
      nextStopScreenPoints.filter((point) => point.id !== selectedNextStopCode),
      clusterRadius,
    )
    : [];
  const multiStopClusters = nextStopClusters.filter((cluster) => cluster.items.length > 1);
  const clusteredNextStopCodes = new Set(
    multiStopClusters.flatMap((cluster) => cluster.items.map((item) => item.id)),
  );

  function zoomIntoCluster(cluster: (typeof multiStopClusters)[number]): void {
    if (isGlobe) {
      const airportsInCluster = cluster.items.map((item) => item.stop.airport);
      const lon = airportsInCluster.reduce((sum, airport) => sum + airport.lon, 0) / airportsInCluster.length;
      const lat = airportsInCluster.reduce((sum, airport) => sum + airport.lat, 0) / airportsInCluster.length;
      setGlobe((previous) => ({
        rotateLon: lon,
        rotateLat: lat,
        scale: Math.min(6, Math.max(previous.scale * 1.7, 1.7)),
      }));
      return;
    }
    setPz((previous) => {
      const nextScale = Math.min(6, Math.max(previous.scale * 1.85, 1.85));
      const worldX = (cluster.x - previous.tx) / previous.scale;
      const worldY = (cluster.y - previous.ty) / previous.scale;
      let tx = width / 2 - worldX * nextScale;
      const ty = height / 2 - worldY * nextScale;
      if (wrapping) tx = normalizeTx(tx, worldWidth * nextScale);
      return { scale: nextScale, tx, ty };
    });
  }
  const nextStopPopoverHeight = selectedNextStop
    ? 66 + selectedNextStop.destination.options.reduce(
      (sum, option) => sum + Math.max(1, option.flightNumbers.length) * 22,
      0,
    )
    : 0;
  const nextStopPopoverX = selectedNextStopScreen
    ? Math.max(12, Math.min(width - 210, selectedNextStopScreen.x + 14))
    : 0;
  const nextStopPopoverY = selectedNextStopScreen
    ? Math.max(12, Math.min(height - nextStopPopoverHeight - 12, selectedNextStopScreen.y - 34))
    : 0;

  return (
    <svg
      ref={svgRef}
      className={`map-view${isGlobe ? ' map-view-globe' : ''}${wrapping ? ' map-view-wrapping' : ''}`}
      data-map-detail={mapDetailLevel}
      data-map-fit={autoFitMode}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={
        groups.every((g) => g.legs.length === 0)
          ? 'World map'
          : `Map showing ${groups.length} routing(s)`
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      style={{ touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' }}
    >
      <defs>
        <clipPath id="map-clip">
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
        {isGlobe && (
          <radialGradient id="globe-shading" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.18" />
            <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
          </radialGradient>
        )}
      </defs>
      <g clipPath="url(#map-clip)">
        <rect x={0} y={0} width={width} height={height} className="map-sea" />
        <g transform={transform}>
          {wrapOffsets.map((offsetX) => (
            <g
              key={`world-${offsetX}`}
              data-map-world-copy="true"
              data-map-wrap-offset={offsetX}
              transform={`translate(${offsetX}, 0)`}
            >
              {spherePath && isGlobe && (
                <path d={spherePath} className="map-sphere" fill="var(--bg-map-sea)" />
              )}
              {worldPath && <path d={worldPath} className="map-land" fill="var(--bg-map-land)" />}
              {graticulePath && <path d={graticulePath} className="map-grid" fill="none" />}
              {spherePath && isGlobe && (
                <path d={spherePath} fill="url(#globe-shading)" style={{ pointerEvents: 'none' }} />
              )}
              {spherePath && isGlobe && (
                <path
                  d={spherePath}
                  className="map-sphere-rim"
                  fill="none"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {arcsByGroup.map((arcs, gi) =>
                gi === activeIndex ? null : arcs.map((arc) =>
                  arc ? (
                    <path
                      key={`inactive-${arc.key}-${offsetX}`}
                      d={arc.d}
                      className={arc.surface ? 'map-arc-surface inactive' : 'map-arc map-arc-inactive'}
                      {...(arc.surface ? { 'data-map-surface': `${arc.from}-${arc.to}` } : {})}
                      style={arc.surface ? undefined : { stroke: arc.color }}
                      fill="none"
                    />
                  ) : null,
                ),
              )}
              {(arcsByGroup[activeIndex] ?? []).map((arc) =>
                arc ? (
                  arc.surface ? (
                    <path
                      key={`active-${arc.key}-${offsetX}`}
                      d={arc.d}
                      className="map-arc-surface active"
                      data-map-surface={`${arc.from}-${arc.to}`}
                      fill="none"
                    />
                  ) : (
                    <g key={`active-${arc.key}-${offsetX}`}>
                      <path d={arc.d} className="map-arc-halo" fill="none" />
                      <path
                        d={arc.d}
                        className="map-arc map-arc-active"
                        style={{ stroke: arc.color }}
                        fill="none"
                      />
                    </g>
                  )
                ) : null,
              )}
              {showDistances &&
                (arcsByGroup[activeIndex] ?? []).map((arc) =>
                  arc && !arc.surface && arc.mid ? (
                    <g
                      key={`dist-${arc.key}-${offsetX}`}
                      className="map-distance-badge"
                      transform={`translate(${arc.mid.x}, ${arc.mid.y})`}
                    >
                      <rect
                        x={-27 / labelInvScale}
                        y={-9 / labelInvScale}
                        width={54 / labelInvScale}
                        height={18 / labelInvScale}
                        rx={4 / labelInvScale}
                        className="map-distance-label-bg"
                      />
                      <text
                        x={0}
                        y={4 / labelInvScale}
                        textAnchor="middle"
                        className="map-distance-label"
                        style={{
                          fontSize: `${10 / labelInvScale}px`,
                          fill: arc.color,
                        }}
                      >
                        {arc.distanceNm.toLocaleString()} nm
                      </text>
                    </g>
                  ) : null,
                )}
              {airportDotsPath && (
                <path d={airportDotsPath} className="map-airport-dots" aria-hidden="true" />
              )}
              {routeAirports.map((airport) => {
                const coords = proj([airport.lon, airport.lat]);
                const x = coords?.[0];
                const y = coords?.[1];
                if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
                  return null;
                }
                const inActiveRoute = activeAirportCodes.has(airport.iata);
                const inAnyRoute = routeAirportCodes.has(airport.iata);
                const waypoint = activeWaypointLabels.get(airport.iata);
                const waypointLabel = waypoint?.label;
                const labelWidth = waypointLabel ? Math.max(48, waypointLabel.length * 7 + 16) : 0;
                const labelPlacement = waypointLabelLayout.get(airport.iata);
                const labelOffsetX = (labelPlacement?.dx ?? 9) / labelLayoutScale;
                // The label rect starts 7 SVG units above its group origin.
                // Compensate here so the screen-space collision box and the
                // rendered rectangle share the same top edge.
                const labelOffsetY = ((labelPlacement?.dy ?? -29) + 7) / labelLayoutScale;
                return (
                  <g
                    key={`${airport.iata}-${offsetX}`}
                    className={`map-airport${inActiveRoute ? ' is-active' : ''}${inAnyRoute && !inActiveRoute ? ' is-in-route' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedAirportCode(airport.iata);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedAirportCode(airport.iata);
                      }
                    }}
                  >
                    <title>{`${airport.iata} ${airport.city}. ${airportActionLabel(airport)}`}</title>
                    <circle
                      cx={x}
                      cy={y}
                      r={(inActiveRoute ? 5.5 : inAnyRoute ? 3.4 : 1.35) / labelInvScale}
                      className="map-airport-dot"
                    />
                    {inActiveRoute && waypointLabel ? (
                      <g
                        className="map-waypoint-label"
                        data-placement={labelPlacement?.anchor ?? 'ne'}
                        transform={`translate(${x + labelOffsetX}, ${y + labelOffsetY})`}
                      >
                        <rect
                          x={0}
                          y={-7 / labelInvScale}
                          width={labelWidth / labelInvScale}
                          height={20 / labelInvScale}
                          rx={4 / labelInvScale}
                          className="map-waypoint-label-bg"
                        />
                        <text
                          x={8 / labelInvScale}
                          y={7 / labelInvScale}
                          className="map-airport-label map-airport-label-active"
                          style={{ fontSize: `${11 / labelInvScale}px` }}
                        >
                          {waypointLabel}
                        </text>
                      </g>
                    ) : showBackgroundAirports && inAnyRoute ? (
                      <text
                        x={x + 7 / labelInvScale}
                        y={y - 5 / labelInvScale}
                        className="map-airport-label map-airport-label-secondary"
                        style={{ fontSize: `${10 / labelInvScale}px` }}
                      >
                        {airport.iata}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              {selectedProjected && (
                <g
                  className="map-airport-popover"
                  transform={`translate(${selectedProjected.x}, ${selectedProjected.y})`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <rect
                    x={10 / labelInvScale}
                    y={-76 / labelInvScale}
                    width={224 / labelInvScale}
                    height={68 / labelInvScale}
                    rx={8 / labelInvScale}
                    className="map-airport-popover-bg"
                  />
                  <text
                    x={22 / labelInvScale}
                    y={-52 / labelInvScale}
                    className="map-airport-popover-title"
                    style={{ fontSize: `${13 / labelInvScale}px` }}
                  >
                    {selectedProjected.airport.iata} · {selectedProjected.airport.city}
                  </text>
                  <text
                    x={22 / labelInvScale}
                    y={-34 / labelInvScale}
                    className="map-airport-popover-route"
                    style={{ fontSize: `${11 / labelInvScale}px` }}
                  >
                    {airportActionLabel(selectedProjected.airport)}
                  </text>
                  {airportCanCommit(selectedProjected.airport) ? (
                    <g
                      className="map-airport-popover-button"
                      role="button"
                      tabIndex={0}
                      aria-label={`Add ${selectedProjected.airport.iata} to route`}
                      onClick={() => {
                        onAirportCommit?.(selectedProjected.airport);
                        setSelectedAirportCode(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onAirportCommit?.(selectedProjected.airport);
                          setSelectedAirportCode(null);
                        }
                      }}
                    >
                      <rect
                        x={22 / labelInvScale}
                        y={-26 / labelInvScale}
                        width={96 / labelInvScale}
                        height={18 / labelInvScale}
                        rx={5 / labelInvScale}
                        className="map-airport-popover-button-bg"
                      />
                      <text
                        x={70 / labelInvScale}
                        y={-13 / labelInvScale}
                        textAnchor="middle"
                        className="map-airport-popover-button-text"
                        style={{ fontSize: `${10 / labelInvScale}px` }}
                      >
                        Add to route
                      </text>
                    </g>
                  ) : (
                    <text
                      x={22 / labelInvScale}
                      y={-14 / labelInvScale}
                      className="map-airport-popover-muted"
                      style={{ fontSize: `${10 / labelInvScale}px` }}
                    >
                      Already the current endpoint
                    </text>
                  )}
                </g>
              )}
            </g>
          ))}
        </g>
        {activeNextLegGuide && availableNextStops.length > 0 && (
          <>
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              className="map-next-leg-veil"
              aria-hidden="true"
            />
            <g className="map-next-leg-overlay" transform={transform}>
              {wrapOffsets.map((offsetX) => (
                <g key={`next-stops-${offsetX}`} transform={`translate(${offsetX}, 0)`}>
                  {nextLegOrigin && (
                    <g
                      className="map-next-origin"
                      data-next-leg-origin={nextLegOrigin.airport.iata}
                      transform={`translate(${nextLegOrigin.x}, ${nextLegOrigin.y})`}
                    >
                      <circle r={13 / labelInvScale} className="map-next-origin-ring" />
                      <circle r={5 / labelInvScale} className="map-next-origin-dot" />
                      <g transform={`translate(${10 / labelInvScale}, ${10 / labelInvScale})`}>
                        <rect
                          x={0}
                          y={0}
                          width={58 / labelInvScale}
                          height={20 / labelInvScale}
                          rx={4 / labelInvScale}
                          className="map-next-origin-label-bg"
                        />
                        <text
                          x={29 / labelInvScale}
                          y={14 / labelInvScale}
                          textAnchor="middle"
                          className="map-next-origin-label"
                          style={{ fontSize: `${10 / labelInvScale}px` }}
                        >
                          FROM {nextLegOrigin.airport.iata}
                        </text>
                      </g>
                    </g>
                  )}
                  {selectedNextStopPreview && (
                    <path
                      d={selectedNextStopPreview}
                      className="map-next-stop-preview"
                      data-next-stop-preview={`${activeNextLegGuide.origin}-${selectedNextStop?.airport.iata ?? ''}`}
                    />
                  )}
                  {availableNextStops.map((stop) => {
                    if (clusteredNextStopCodes.has(stop.airport.iata)) return null;
                    const needsCheck = !stop.destination.options.some((option) => option.scheduleStatus === 'covered');
                    return (
                      <g
                        key={`${stop.airport.iata}-${offsetX}`}
                        className={`map-next-stop${needsCheck ? ' needs-check' : ''}${selectedNextStopCode === stop.airport.iata ? ' selected' : ''}`}
                        data-next-stop={stop.airport.iata}
                        role="button"
                        tabIndex={0}
                        aria-label={`${activeNextLegGuide.origin}→${stop.airport.iata}`}
                        transform={`translate(${stop.x}, ${stop.y})`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedAirportCode(null);
                          chooseNextStop(stop.airport.iata);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedAirportCode(null);
                            chooseNextStop(stop.airport.iata);
                          }
                        }}
                      >
                        <circle r={10 / labelInvScale} className="map-next-stop-ring" />
                        <circle r={4 / labelInvScale} className="map-next-stop-dot" />
                        <g transform={`translate(${9 / labelInvScale}, ${-15 / labelInvScale})`}>
                          <rect
                            x={0}
                            y={0}
                            width={38 / labelInvScale}
                            height={20 / labelInvScale}
                            rx={4 / labelInvScale}
                            className="map-next-stop-label-bg"
                          />
                          <text
                            x={19 / labelInvScale}
                            y={14 / labelInvScale}
                            textAnchor="middle"
                            className="map-next-stop-label"
                            style={{ fontSize: `${10 / labelInvScale}px` }}
                          >
                            {stop.airport.iata}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </g>
              ))}
            </g>
            {multiStopClusters.length > 0 && (
              <g className="map-next-stop-clusters">
                {multiStopClusters.map((cluster) => (
                  <g
                    key={cluster.id}
                    className="map-next-stop-cluster"
                    data-map-cluster-size={cluster.items.length}
                    role="button"
                    tabIndex={0}
                    aria-label={locale === 'zh-TW'
                      ? `${cluster.items.length} 個鄰近目的地，放大查看。`
                      : `${cluster.items.length} nearby destinations. Zoom in to inspect.`}
                    transform={`translate(${cluster.x}, ${cluster.y})`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      zoomIntoCluster(cluster);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        zoomIntoCluster(cluster);
                      }
                    }}
                  >
                    <circle r={15} className="map-next-stop-cluster-ring" />
                    <text y={4} textAnchor="middle" className="map-next-stop-cluster-count">
                      {cluster.items.length}
                    </text>
                  </g>
                ))}
              </g>
            )}
            <g className="map-next-leg-guide-label" transform={`translate(12, ${height - 42})`} aria-hidden="true">
              <rect width={104} height={30} rx={5} className="map-next-leg-guide-label-bg" />
              <text x={12} y={20} className="map-next-leg-guide-label-text">
                {activeNextLegGuide.origin} → ? · {availableNextStops.length}
              </text>
            </g>
            {selectedNextStop && selectedNextStopScreen && (
              <g
                className="map-next-stop-popover"
                transform={`translate(${nextStopPopoverX}, ${nextStopPopoverY})`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <rect
                  width={198}
                  height={nextStopPopoverHeight}
                  rx={7}
                  className="map-next-stop-popover-bg"
                />
                <text x={14} y={21} className="map-next-stop-popover-title">
                  {activeNextLegGuide.origin} → {selectedNextStop.airport.iata}
                </text>
                <text x={14} y={39} className="map-next-stop-popover-city">
                  {selectedNextStop.airport.city}
                </text>
                {(() => {
                  let row = 0;
                  return selectedNextStop.destination.options.flatMap((option) => {
                    const labels = option.flightNumbers.length > 0
                      ? option.flightNumbers
                      : [`${option.carrier} · #?`];
                    return labels.map((label) => {
                      const y = 50 + row++ * 22;
                      return (
                        <g key={`${option.carrier}-${label}`} transform={`translate(12, ${y})`}>
                          <rect width={174} height={18} rx={4} className="map-next-stop-flight-bg" />
                          <text x={9} y={13} className="map-next-stop-flight-text">{label}</text>
                        </g>
                      );
                    });
                  });
                })()}
                <text x={14} y={nextStopPopoverHeight - 8} className="map-next-stop-popover-hint">
                  Select flight number in the route panel
                </text>
              </g>
            )}
          </>
        )}
        {isTransformed && (
          <g className="map-reset-btn-group" onClick={resetView} style={{ cursor: 'pointer' }}>
            <rect x={width - 78} y={8} width={70} height={28} rx={6} className="map-reset-btn-bg" />
            <text x={width - 43} y={26} textAnchor="middle" className="map-reset-btn-text">
              Reset
            </text>
          </g>
        )}
        {worldError && (
          <text x={10} y={20} className="map-world-error">
            World outline unavailable
          </text>
        )}
      </g>
    </svg>
  );
}
