/**
 * Interactive SVG world map.
 *
 *   - Multiple projections (Mercator, Equirectangular, Azimuthal Equidistant, Orthographic)
 *   - Pan via pointer drag, zoom via mouse wheel
 *   - Continent outlines from world-atlas 110m TopoJSON
 *   - Great-circle arcs per leg
 *   - Airport dots + IATA labels for chain airports
 *   - Resets viewport when projection changes
 *
 * Projections are computed once per (projection + viewport + center) — the
 * pan/zoom transform is applied as an SVG `transform` on a group so we never
 * have to re-project on every drag frame.
 */

import { useMemo, useRef, useState } from 'react';
import { geoGraticule, geoPath, type GeoPath, type GeoProjection } from 'd3-geo';
import { greatCircleSvgPathProjected } from '../lib/calc/svg-arc.ts';
import { buildProjection, type ProjectionId } from '../lib/calc/projections.ts';
import type { Airport, Leg } from '../lib/types.ts';
import { useWorldMap } from '../state/use-world-map.ts';

interface Props {
  airports: ReadonlyArray<Airport>;
  legs: ReadonlyArray<Leg>;
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

export function MapView({ airports, legs, width, height, projection }: Props): React.ReactElement {
  const { features, error: worldError } = useWorldMap();
  // Pan/zoom resets implicitly: App.tsx remounts MapView when projection changes
  // (via `key={projection}`), so initial state IDENTITY always applies.
  const [pz, setPz] = useState<PanZoomState>(IDENTITY);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origin: PanZoomState } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // For azimuthal + orthographic, center on the first chain airport (or 0,0).
  const center = useMemo<{ lat: number; lon: number }>(() => {
    const first = airports[0];
    if (!first) return { lat: 0, lon: 0 };
    return { lat: first.lat, lon: first.lon };
  }, [airports]);

  const proj = useMemo<GeoProjection>(
    () => buildProjection(projection, { width, height, centerLat: center.lat, centerLon: center.lon }),
    [projection, width, height, center.lat, center.lon],
  );

  const pathBuilder = useMemo<GeoPath>(() => geoPath(proj), [proj]);

  // Continent outline SVG `d` for the loaded world geometry.
  const worldPath = useMemo<string>(() => {
    if (!features) return '';
    return pathBuilder(features) ?? '';
  }, [features, pathBuilder]);

  // Graticule (10° lat/lon grid).
  const graticulePath = useMemo<string>(() => {
    const g = geoGraticule().step([30, 30])();
    return pathBuilder(g) ?? '';
  }, [pathBuilder]);

  // Outer sphere edge (only meaningful for orthographic; renders a rim).
  const spherePath = useMemo<string>(() => {
    const sphere = { type: 'Sphere' as const };
    return pathBuilder(sphere) ?? '';
  }, [pathBuilder]);

  // Great-circle arcs.
  const arcs = useMemo(() => {
    return legs.map((leg, i) => {
      const from = airports.find((a) => a.iata === leg.from);
      const to = airports.find((a) => a.iata === leg.to);
      if (!from || !to) return null;
      const d = greatCircleSvgPathProjected(from, to, proj);
      return { d, key: `${leg.from}-${leg.to}-${i}` };
    });
  }, [airports, legs, proj]);

  // Project chain airports.
  const projectedAirports = useMemo(() => {
    return airports.map((a) => {
      const coords = proj([a.lon, a.lat]);
      if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
        return { airport: a, x: null as number | null, y: null as number | null };
      }
      return { airport: a, x: coords[0], y: coords[1] };
    });
  }, [airports, proj]);

  // ── Pan + zoom handlers ──

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>): void {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pz };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>): void {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setPz({ scale: d.origin.scale, tx: d.origin.tx + dx, ty: d.origin.ty + dy });
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
      // Zoom toward the cursor — keep the point under the cursor fixed.
      const worldX = (px - prev.tx) / prev.scale;
      const worldY = (py - prev.ty) / prev.scale;
      return {
        scale: nextScale,
        tx: px - worldX * nextScale,
        ty: py - worldY * nextScale,
      };
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
        airports.length === 0
          ? 'World map'
          : `Map showing route via ${airports.map((a) => a.iata).join(' → ')}`
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
          {/* Sphere rim (matters for orthographic) */}
          {spherePath && projection === 'orthographic' && (
            <path d={spherePath} className="map-sphere" fill="var(--bg-map-sea)" />
          )}
          {/* World outline */}
          {worldPath && <path d={worldPath} className="map-land" fill="var(--bg-map-land)" />}
          {/* Graticule */}
          {graticulePath && <path d={graticulePath} className="map-grid" fill="none" />}
          {/* Great-circle arcs */}
          {arcs.map(
            (arc) =>
              arc && <path key={arc.key} d={arc.d} className="map-arc" fill="none" />,
          )}
          {/* Airport dots */}
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
        {/* Reset-view affordance, top-right corner of viewport */}
        {(pz.scale !== 1 || pz.tx !== 0 || pz.ty !== 0) && (
          <g className="map-reset-btn-group" onClick={resetView} style={{ cursor: 'pointer' }}>
            <rect
              x={width - 78}
              y={8}
              width={70}
              height={28}
              rx={6}
              className="map-reset-btn-bg"
            />
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
