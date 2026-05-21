/**
 * Interactive SVG world map. v0.4: renders multiple routing groups, each
 * with its own color (from GROUP_COLORS), on the same projection.
 *
 *   - Multiple projections (Mercator, Equirectangular, Azimuthal Equidistant, Orthographic)
 *   - Pan via pointer drag, zoom via mouse wheel
 *   - Continent outlines from world-atlas 110m TopoJSON
 *   - Great-circle arcs per leg, colored by group
 *   - Airport dots + IATA labels for every airport in any group's chain
 */

import { useMemo, useRef, useState } from 'react';
import { geoGraticule, geoPath, type GeoPath, type GeoProjection } from 'd3-geo';
import { groupColor } from '../lib/group-colors.ts';
import { greatCircleSvgPathProjected } from '../lib/calc/svg-arc.ts';
import { buildProjection, type ProjectionId } from '../lib/calc/projections.ts';
import type { Airport, RoutingGroup } from '../lib/types.ts';
import { useWorldMap } from '../state/use-world-map.ts';

interface Props {
  /** Map of all airports (used to resolve IATA → coords). */
  airportLookup: ReadonlyMap<string, Airport>;
  /** All groups to render — each gets its own color. */
  groups: ReadonlyArray<RoutingGroup>;
  /** Active group index — emphasized visually. */
  activeIndex: number;
  width: number;
  height: number;
  projection: ProjectionId;
}

interface PanZoomState {
  scale: number;
  tx: number;
  ty: number;
}

const IDENTITY: PanZoomState = { scale: 1, tx: 0, ty: 0 };

export function MapView({
  airportLookup,
  groups,
  activeIndex,
  width,
  height,
  projection,
}: Props): React.ReactElement {
  const { features, error: worldError } = useWorldMap();
  const [pz, setPz] = useState<PanZoomState>(IDENTITY);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origin: PanZoomState } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Auto-center azimuthal + orthographic on the first airport of the active group.
  const center = useMemo<{ lat: number; lon: number }>(() => {
    const activeGroup = groups[activeIndex] ?? groups[0];
    const firstLeg = activeGroup?.legs[0];
    if (!firstLeg) return { lat: 0, lon: 0 };
    const first = airportLookup.get(firstLeg.from);
    if (!first) return { lat: 0, lon: 0 };
    return { lat: first.lat, lon: first.lon };
  }, [groups, activeIndex, airportLookup]);

  const proj = useMemo<GeoProjection>(
    () => buildProjection(projection, { width, height, centerLat: center.lat, centerLon: center.lon }),
    [projection, width, height, center.lat, center.lon],
  );

  const pathBuilder = useMemo<GeoPath>(() => geoPath(proj), [proj]);

  const worldPath = useMemo<string>(() => {
    if (!features) return '';
    return pathBuilder(features) ?? '';
  }, [features, pathBuilder]);

  const graticulePath = useMemo<string>(() => {
    const g = geoGraticule().step([30, 30])();
    return pathBuilder(g) ?? '';
  }, [pathBuilder]);

  const spherePath = useMemo<string>(() => {
    const sphere = { type: 'Sphere' as const };
    return pathBuilder(sphere) ?? '';
  }, [pathBuilder]);

  // Arcs per group.
  const arcsByGroup = useMemo(() => {
    return groups.map((group, gi) => {
      return group.legs.map((leg, i) => {
        const from = airportLookup.get(leg.from);
        const to = airportLookup.get(leg.to);
        if (!from || !to) return null;
        const d = greatCircleSvgPathProjected(from, to, proj);
        return { d, key: `${gi}-${leg.from}-${leg.to}-${i}`, color: groupColor(gi), groupIndex: gi };
      });
    });
  }, [groups, airportLookup, proj]);

  // Union of all airports across all groups, deduplicated.
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

  // ── Pan + zoom ──

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>): void {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pz };
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>): void {
    const d = dragRef.current;
    if (!d) return;
    setPz({ scale: d.origin.scale, tx: d.origin.tx + (e.clientX - d.startX), ty: d.origin.ty + (e.clientY - d.startY) });
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>): void {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
    setDragging(false);
  }
  function onWheel(e: React.WheelEvent<SVGSVGElement>): void {
    e.preventDefault();
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
      return { scale: nextScale, tx: px - worldX * nextScale, ty: py - worldY * nextScale };
    });
  }
  function resetView(): void {
    setPz(IDENTITY);
  }

  const transform = `translate(${pz.tx}, ${pz.ty}) scale(${pz.scale})`;

  return (
    <svg
      ref={svgRef}
      className="map-view"
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
      </defs>
      <g clipPath="url(#map-clip)">
        <rect x={0} y={0} width={width} height={height} className="map-sea" />
        <g transform={transform}>
          {spherePath && projection === 'orthographic' && (
            <path d={spherePath} className="map-sphere" fill="var(--bg-map-sea)" />
          )}
          {worldPath && <path d={worldPath} className="map-land" fill="var(--bg-map-land)" />}
          {graticulePath && <path d={graticulePath} className="map-grid" fill="none" />}
          {arcsByGroup.map((arcs, gi) =>
            arcs.map(
              (arc) =>
                arc && (
                  <path
                    key={arc.key}
                    d={arc.d}
                    className={`map-arc${gi === activeIndex ? ' map-arc-active' : ''}`}
                    style={{ stroke: arc.color, opacity: gi === activeIndex ? 1 : 0.7 }}
                    fill="none"
                  />
                ),
            ),
          )}
          {projectedAirports.map(({ airport, x, y }) => {
            if (x === null || y === null) return null;
            return (
              <g key={airport.iata} className="map-airport">
                <circle cx={x} cy={y} r={5 / Math.max(pz.scale, 1)} className="map-airport-dot" />
                <text
                  x={x + 8 / Math.max(pz.scale, 1)}
                  y={y - 6 / Math.max(pz.scale, 1)}
                  className="map-airport-label"
                  style={{ fontSize: `${12 / Math.max(pz.scale, 1)}px` }}
                >
                  {airport.iata}
                </text>
              </g>
            );
          })}
        </g>
        {(pz.scale !== 1 || pz.tx !== 0 || pz.ty !== 0) && (
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
