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

import { useCallback, useMemo, useRef, useState } from 'react';
import { geoGraticule, geoPath, type GeoPath, type GeoProjection } from 'd3-geo';
import { groupColor } from '../lib/group-colors.ts';
import { bearingDeg } from '../lib/calc/haversine.ts';
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
  groups: ReadonlyArray<RoutingGroup>;
  activeIndex: number;
  width: number;
  height: number;
  projection: ProjectionId;
  showBearings?: boolean;
  onSvgReady?: (svg: SVGSVGElement | null) => void;
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

export function MapView({
  airportLookup,
  groups,
  activeIndex,
  width,
  height,
  projection,
  showBearings = false,
  onSvgReady,
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
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originPz: PanZoomState;
    originGlobe: GlobeState;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const svgRefCallback = useCallback(
    (el: SVGSVGElement | null) => {
      svgRef.current = el;
      onSvgReady?.(el);
    },
    [onSvgReady],
  );

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
        const d = greatCircleSvgPathProjected(from, to, proj);
        const midLat = (from.lat + to.lat) / 2;
        const midLon = (from.lon + to.lon) / 2;
        const midProj = proj([midLon, midLat]);
        const bearing = Math.round(bearingDeg(from, to));
        return {
          d,
          key: `${gi}-${leg.from}-${leg.to}-${i}`,
          color: groupColor(gi),
          groupIndex: gi,
          mid:
            midProj && Number.isFinite(midProj[0]) && Number.isFinite(midProj[1])
              ? { x: midProj[0], y: midProj[1] }
              : null,
          bearing,
        };
      });
    });
  }, [groups, airportLookup, proj]);

  const allAirports = useMemo(() => {
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

  const projectedAirports = useMemo(() => {
    return allAirports.map((a) => {
      const coords = proj([a.lon, a.lat]);
      if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
        return { airport: a, x: null as number | null, y: null as number | null };
      }
      return { airport: a, x: coords[0], y: coords[1] };
    });
  }, [allAirports, proj]);

  // ── Interaction ──

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>): void {
    if (e.button !== 0) return;
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
    if (!d) return;
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
  const labelInvScale = isGlobe ? Math.max(globe.scale, 1) : Math.max(pz.scale, 1);

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
      ref={svgRefCallback}
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
              {showBearings &&
                arcsByGroup.map((arcs) =>
                  arcs.map((arc) =>
                    arc && arc.mid ? (
                      <text
                        key={`bearing-${arc.key}-${offsetX}`}
                        x={arc.mid.x}
                        y={arc.mid.y}
                        className="map-bearing-label"
                        style={{
                          fontSize: `${10 / labelInvScale}px`,
                          fill: arc.color,
                        }}
                      >
                        {arc.bearing}°
                      </text>
                    ) : null,
                  ),
                )}
              {projectedAirports.map(({ airport, x, y }) => {
                if (x === null || y === null) return null;
                return (
                  <g key={`${airport.iata}-${offsetX}`} className="map-airport">
                    <circle cx={x} cy={y} r={5 / labelInvScale} className="map-airport-dot" />
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
