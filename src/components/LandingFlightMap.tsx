import { useMemo } from 'react';
import { geoEquirectangular, geoGraticule, geoPath } from 'd3-geo';
import type { Airport } from '../lib/types.ts';
import { useWorldMap } from '../state/use-world-map.ts';

interface Props {
  readonly airportLookup: ReadonlyMap<string, Airport>;
}

const WIDTH = 1200;
const HEIGHT = 590;

const ROUTES = [
  { id: 'pacific', airports: ['TPE', 'NRT', 'LAX', 'JFK'], label: 'Pacific → North America' },
  { id: 'atlantic', airports: ['JFK', 'LHR', 'FRA', 'IST'], label: 'Atlantic → Europe' },
  { id: 'asia', airports: ['IST', 'SIN', 'TPE'], label: 'Europe → Asia' },
] as const;

function projectedPoint(airport: Airport): readonly [number, number] {
  const x = ((airport.lon + 180) / 360) * WIDTH;
  const y = HEIGHT / 2 - airport.lat * WIDTH / 360;
  return [x, y];
}

function curvedPath(from: Airport, to: Airport): string {
  const [x1, y1] = projectedPoint(from);
  const [toX, y2] = projectedPoint(to);
  let x2 = toX;
  const rawDx = x2 - x1;
  if (Math.abs(rawDx) > WIDTH / 2) x2 += rawDx > 0 ? -WIDTH : WIDTH;
  const dx = x2 - x1;
  const lift = Math.max(28, Math.min(105, Math.abs(dx) * 0.16));
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - lift;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

export function LandingFlightMap({ airportLookup }: Props): React.ReactElement {
  const { features } = useWorldMap();
  const projection = useMemo(() => geoEquirectangular().scale(WIDTH / (2 * Math.PI)).translate([WIDTH / 2, HEIGHT / 2]), []);
  const path = useMemo(() => geoPath(projection), [projection]);
  const worldPath = features ? path(features) ?? '' : '';
  const graticulePath = path(geoGraticule().step([30, 30])()) ?? '';

  const routeSegments = ROUTES.flatMap((route) => route.airports.slice(0, -1).map((code, index) => {
    const from = airportLookup.get(code);
    const to = airportLookup.get(route.airports[index + 1]!);
    if (!from || !to) return null;
    const crossesDateLine = Math.abs(to.lon - from.lon) > 180;
    const wrapShift = crossesDateLine ? (from.lon > to.lon ? -WIDTH : WIDTH) : 0;
    return { id: `${route.id}-${from.iata}-${to.iata}`, routeId: route.id, from, to, d: curvedPath(from, to), wrapShift };
  })).filter((segment): segment is NonNullable<typeof segment> => segment !== null);

  const stops = [...new Set(ROUTES.flatMap((route) => route.airports))]
    .map((code) => airportLookup.get(code))
    .filter((airport): airport is Airport => airport !== undefined);

  return (
    <div className="landing-map-card" aria-label="Animated classic round-the-world flight routes">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="World map with classic flight routes">
        <path className="landing-map-graticule" d={graticulePath} />
        {worldPath && <path className="landing-map-world" d={worldPath} />}
        {routeSegments.map((segment, index) => (
          <g key={segment.id}>
            <path id={`landing-route-${index}`} className={`landing-route landing-route-${segment.routeId}`} d={segment.d} />
            {segment.wrapShift !== 0 && (
              <path
                className={`landing-route landing-route-${segment.routeId}`}
                d={segment.d}
                transform={`translate(${segment.wrapShift} 0)`}
              />
            )}
            <g className={`landing-plane landing-plane-${segment.routeId}`}>
              <path d="M-8 1 L-2 -1 L1 -8 L4 -8 L3 -1 L9 2 L9 4 L3 3 L1 10 L-2 10 L-2 3 L-8 4 Z" />
              <animateMotion dur={`${5.5 + (index % 4) * 0.8}s`} begin={`${index * -0.9}s`} repeatCount="indefinite" rotate="auto">
                <mpath href={`#landing-route-${index}`} />
              </animateMotion>
            </g>
          </g>
        ))}
        {stops.map((airport) => {
          const [x, y] = projectedPoint(airport);
          return (
            <g key={airport.iata} className="landing-stop" transform={`translate(${x} ${y})`}>
              <circle r="4" />
              <text x="8" y="-8">{airport.iata}</text>
            </g>
          );
        })}
      </svg>
      <div className="landing-map-legend" aria-hidden="true">
        {ROUTES.map((route) => <span key={route.id} className={`landing-legend-${route.id}`}>{route.label}</span>)}
      </div>
    </div>
  );
}
