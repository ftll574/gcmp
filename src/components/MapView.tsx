/**
 * SVG world map with great-circle arcs.
 *
 *   - Web Mercator projection
 *   - Sea background, faint lat/lon grid every 30°
 *   - Each leg → great-circle arc drawn as <path>
 *   - Each airport in chain → filled dot + IATA label
 *
 * deck.gl is deferred to v1.1 (eng review OV3). SVG is enough for v1 and
 * keeps the bundle small. Continent outlines are not drawn — the arcs +
 * airport labels are the visual interest. The map IS minimal by intent.
 */

import { useMemo } from 'react';
import { greatCircleSvgPath, projectToSvg, type SvgViewport } from '../lib/calc/svg-arc.ts';
import type { Airport, Leg } from '../lib/types.ts';

interface Props {
  airports: ReadonlyArray<Airport>;
  legs: ReadonlyArray<Leg>;
  width: number;
  height: number;
}

export function MapView({ airports, legs, width, height }: Props): React.ReactElement {
  const vb: SvgViewport = useMemo(() => ({ width, height }), [width, height]);

  const gridLines = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }> = [];
    // Longitude lines every 30°.
    for (let lon = -180; lon <= 180; lon += 30) {
      const top = projectToSvg({ lat: 85, lon }, vb);
      const bot = projectToSvg({ lat: -85, lon }, vb);
      lines.push({ x1: top.x, y1: top.y, x2: bot.x, y2: bot.y, key: `lon-${lon}` });
    }
    // Latitude lines every 30°.
    for (let lat = -60; lat <= 60; lat += 30) {
      const left = projectToSvg({ lat, lon: -180 }, vb);
      const right = projectToSvg({ lat, lon: 180 }, vb);
      lines.push({ x1: left.x, y1: left.y, x2: right.x, y2: right.y, key: `lat-${lat}` });
    }
    return lines;
  }, [vb]);

  const arcs = useMemo(() => {
    return legs.map((leg, i) => {
      const from = airports.find((a) => a.iata === leg.from);
      const to = airports.find((a) => a.iata === leg.to);
      if (!from || !to) return null;
      const d = greatCircleSvgPath(from, to, vb);
      return { d, key: `${leg.from}-${leg.to}-${i}` };
    });
  }, [airports, legs, vb]);

  return (
    <svg
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
    >
      <rect x={0} y={0} width={width} height={height} className="map-sea" />
      {/* Faint world background — solid land color hint via a rounded rect */}
      <rect x={0} y={0} width={width} height={height} className="map-land-tint" />
      {gridLines.map((l) => (
        <line
          key={l.key}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          className="map-grid"
        />
      ))}
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        className="map-equator"
      />
      {arcs.map(
        (arc) =>
          arc && (
            <path key={arc.key} d={arc.d} className="map-arc" fill="none" />
          ),
      )}
      {airports.map((a) => {
        const p = projectToSvg({ lat: a.lat, lon: a.lon }, vb);
        return (
          <g key={a.iata} className="map-airport">
            <circle cx={p.x} cy={p.y} r={5} className="map-airport-dot" />
            <text x={p.x + 8} y={p.y - 6} className="map-airport-label">
              {a.iata}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
