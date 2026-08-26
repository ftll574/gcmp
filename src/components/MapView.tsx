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

import { useMemo, useRef, useState } from 'react';
import { geoGraticule, geoPath, type GeoPath, type GeoProjection } from 'd3-geo';
import { groupColor } from '../lib/group-colors.ts';
import { distanceNm } from '../lib/calc/haversine.ts';
import { greatCircleSvgPathProjected } from '../lib/calc/svg-arc.ts';
import {
  buildProjection,
  isWrappingProjection,
  type ProjectionId,
} from '../lib/calc/projections.ts';
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
}: Props): React.ReactElement {
  const { features, error: worldError } = useWorldMap();

  const isGlobe = projection === 'orthographic';
  const wrapping = isWrappingProjection(projection);

  // For wrapping projections, the world width in projected pixels equals the
  // viewport width after fitSize. For globe, irrelevant.
  const worldWidth = width;

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
  const hoverFrameRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
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

  const pathBuilder = useMemo<GeoPath>(() => geoPath(proj), [proj]);

  const worldPath = useMemo<string>(
    () => (features ? (pathBuilder(features) ?? '') : ''),
    [features, pathBuilder],
  );

  const graticulePath = useMemo<string>(
    () => pathBuilder(geoGraticule().step([30, 30])()) ?? '',
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
  const routeAirportCodes = useMemo(
    () => new Set(routeAirports.map((airport) => airport.iata)),
    [routeAirports],
  );

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
  const airportDotsPath = useMemo(
    () => airportDotPath(projectedAirports, routeAirportCodes, 1.25 / labelInvScale),
    [projectedAirports, routeAirportCodes, labelInvScale],
  );

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

  const routeEndpoint = activeAirports.at(-1) ?? null;
  const routeOrigin = activeAirports[0] ?? null;

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
      setPz(PAN_IDENTITY);
    }
  }

  const transform = isGlobe ? '' : `translate(${pz.tx}, ${pz.ty}) scale(${pz.scale})`;

  const isTransformed = isGlobe
    ? globe.rotateLon !== initialCenter.lon ||
      globe.rotateLat !== initialCenter.lat ||
      globe.scale !== 1
    : pz.scale !== 1 || pz.tx !== 0 || pz.ty !== 0;

  // For wrapping projections render world / graticule / arcs / airports at
  // 3 horizontal offsets so the seam at ±180° is never visible.
  const wrapOffsets = wrapping ? [-worldWidth, 0, worldWidth] : [0];

  return (
    <svg
      ref={svgRef}
      className={`map-view${isGlobe ? ' map-view-globe' : ''}${wrapping ? ' map-view-wrapping' : ''}`}
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
            <g key={`world-${offsetX}`} transform={`translate(${offsetX}, 0)`}>
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
                arcs.map(
                  (arc) =>
                    arc && (
                      <path
                        key={`${arc.key}-${offsetX}`}
                        d={arc.d}
                        className={`map-arc${gi === activeIndex ? ' map-arc-active' : ''}`}
                        style={{ stroke: arc.color, opacity: gi === activeIndex ? 1 : 0.7 }}
                        fill="none"
                      />
                    ),
                ),
              )}
              {showDistances &&
                arcsByGroup.map((arcs) =>
                  arcs.map((arc) =>
                    arc && arc.mid ? (
                      <text
                        key={`dist-${arc.key}-${offsetX}`}
                        x={arc.mid.x}
                        y={arc.mid.y}
                        className="map-distance-label"
                        style={{
                          fontSize: `${11 / labelInvScale}px`,
                          fill: arc.color,
                        }}
                      >
                        {arc.distanceNm.toLocaleString()} nm
                      </text>
                    ) : null,
                  ),
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
                      r={(inActiveRoute ? 5 : inAnyRoute ? 3.8 : 1.35) / labelInvScale}
                      className="map-airport-dot"
                    />
                    <text
                      x={x + 8 / labelInvScale}
                      y={y - 6 / labelInvScale}
                      className="map-airport-label"
                      style={{ fontSize: `${12 / labelInvScale}px` }}
                    >
                      {airport.iata}
                    </text>
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
