/**
 * Experimental high-performance Mercator renderer.
 *
 * deck.gl owns the heavy layers:
 *   - GeoJsonLayer: static world outline
 *   - ScatterplotLayer: all airports as one GPU layer
 *   - GreatCircleLayer: RTW route legs
 *   - TextLayer: labels only for airports in the current route
 *
 * This renderer is intentionally used only for Mercator until the other
 * projections have deck.gl equivalents.
 */

import { useEffect, useMemo, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView as DeckMapView, type MapViewState, type PickingInfo } from '@deck.gl/core';
import { GreatCircleLayer } from '@deck.gl/geo-layers';
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { FeatureCollection, Geometry } from 'geojson';
import { groupColor } from '../lib/group-colors.ts';
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
  onAirportCommit?: (airport: Airport) => void;
  onSvgReady?: (svg: SVGSVGElement | null) => void;
}

interface RouteLegDatum {
  readonly groupIndex: number;
  readonly from: Airport;
  readonly to: Airport;
}

interface AirportPopover {
  readonly airport: Airport;
  readonly x: number;
  readonly y: number;
}

type Rgba = [number, number, number, number];

const EMPTY_WORLD: FeatureCollection<Geometry> = {
  type: 'FeatureCollection',
  features: [],
};

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value)) return [0, 122, 255];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function initialViewStateFor(activeAirports: ReadonlyArray<Airport>): MapViewState {
  const first = activeAirports[0];
  return {
    longitude: first?.lon ?? 0,
    latitude: first?.lat ?? 18,
    zoom: first ? 1.25 : 0.45,
    minZoom: 0,
    maxZoom: 9,
    pitch: 0,
    bearing: 0,
  };
}

function airportPosition(airport: Airport): [number, number] {
  return [airport.lon, airport.lat];
}

function canCreateWebGlContext(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
}

export function DeckGlMapView({
  airportLookup,
  airports,
  activeAirports,
  groups,
  activeIndex,
  width,
  height,
  onAirportCommit,
  onSvgReady,
}: Props): React.ReactElement {
  const { features, error: worldError } = useWorldMap();
  const [webglSupported] = useState(canCreateWebGlContext);
  const [viewState, setViewState] = useState<MapViewState>(() => initialViewStateFor(activeAirports));
  const [popover, setPopover] = useState<AirportPopover | null>(null);

  useEffect(() => {
    onSvgReady?.(null);
  }, [onSvgReady]);

  const activeAirportCodes = useMemo(
    () => new Set(activeAirports.map((airport) => airport.iata)),
    [activeAirports],
  );

  const routeAirports = useMemo(() => {
    const seen = new Set<string>();
    const out: Airport[] = [];
    for (const group of groups) {
      for (const leg of group.legs) {
        for (const code of [leg.from, leg.to]) {
          if (seen.has(code)) continue;
          const airport = airportLookup.get(code);
          if (!airport) continue;
          seen.add(code);
          out.push(airport);
        }
      }
    }
    return out;
  }, [groups, airportLookup]);

  const routeLegs = useMemo<RouteLegDatum[]>(() => {
    return groups.flatMap((group, groupIndex) =>
      group.legs.flatMap((leg) => {
        const from = airportLookup.get(leg.from);
        const to = airportLookup.get(leg.to);
        if (!from || !to) return [];
        return [{ groupIndex, from, to }];
      }),
    );
  }, [groups, airportLookup]);

  const routeEndpoint = activeAirports.at(-1) ?? null;
  const routeOrigin = activeAirports[0] ?? null;

  function airportActionLabel(airport: Airport): string {
    if (!routeEndpoint) return `Start route at ${airport.iata}`;
    if (routeEndpoint.iata === airport.iata) return `${airport.iata} is current endpoint`;
    if (routeOrigin && airport.iata === routeOrigin.iata && activeAirports.length > 1) {
      return `Close loop ${routeEndpoint.iata} -> ${airport.iata}`;
    }
    return `Add leg ${routeEndpoint.iata} -> ${airport.iata}`;
  }

  function airportCanCommit(airport: Airport): boolean {
    return routeEndpoint?.iata !== airport.iata;
  }

  const layers = useMemo(
    () => [
      new GeoJsonLayer({
        id: 'world',
        data: features ?? EMPTY_WORLD,
        pickable: false,
        filled: true,
        stroked: true,
        getFillColor: [232, 236, 240, 255] satisfies Rgba,
        getLineColor: [194, 202, 211, 255] satisfies Rgba,
        lineWidthMinPixels: 0.5,
      }),
      new GreatCircleLayer<RouteLegDatum>({
        id: 'route-great-circles',
        data: routeLegs,
        pickable: false,
        getSourcePosition: (leg) => airportPosition(leg.from),
        getTargetPosition: (leg) => airportPosition(leg.to),
        getSourceColor: (leg) => [...hexToRgb(groupColor(leg.groupIndex)), leg.groupIndex === activeIndex ? 230 : 150] as Rgba,
        getTargetColor: (leg) => [...hexToRgb(groupColor(leg.groupIndex)), leg.groupIndex === activeIndex ? 230 : 150] as Rgba,
        getWidth: (leg) => (leg.groupIndex === activeIndex ? 2.5 : 1.5),
        widthUnits: 'pixels',
      }),
      new ScatterplotLayer<Airport>({
        id: 'airports',
        data: airports,
        pickable: true,
        radiusUnits: 'pixels',
        getPosition: airportPosition,
        getRadius: (airport) => (activeAirportCodes.has(airport.iata) ? 5 : 2),
        getFillColor: (airport) =>
          activeAirportCodes.has(airport.iata)
            ? ([0, 122, 255, 255] satisfies Rgba)
            : ([92, 103, 115, 74] satisfies Rgba),
        getLineColor: [255, 255, 255, 210] satisfies Rgba,
        lineWidthUnits: 'pixels',
        getLineWidth: (airport) => (activeAirportCodes.has(airport.iata) ? 1.5 : 0),
        autoHighlight: true,
        highlightColor: [17, 24, 39, 210] satisfies Rgba,
        onHover: (info: PickingInfo<Airport>) => {
          if (!info.object) return;
          setPopover({ airport: info.object, x: info.x, y: info.y });
        },
        onClick: (info: PickingInfo<Airport>) => {
          if (!info.object) return false;
          setPopover({ airport: info.object, x: info.x, y: info.y });
          return true;
        },
      }),
      new TextLayer<Airport>({
        id: 'route-airport-labels',
        data: routeAirports,
        pickable: false,
        getPosition: airportPosition,
        getText: (airport) => airport.iata,
        getSize: 12,
        getColor: [23, 23, 23, 255] satisfies Rgba,
        getPixelOffset: [10, -8],
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontWeight: 700,
        background: true,
        getBackgroundColor: [255, 255, 255, 160] satisfies Rgba,
        backgroundPadding: [2, 1],
      }),
    ],
    [features, routeLegs, activeIndex, airports, activeAirportCodes, routeAirports],
  );

  return (
    <div className="map-view deck-map-view" style={{ width, height }}>
      {webglSupported ? (
        <DeckGL
          views={new DeckMapView({ repeat: true })}
          viewState={viewState}
          controller
          layers={layers}
          width={width}
          height={height}
          onViewStateChange={({ viewState: nextViewState }) => {
            setViewState(nextViewState as MapViewState);
          }}
          onClick={(info) => {
            if (!info.object) setPopover(null);
          }}
          getCursor={({ isDragging, isHovering }) => {
            if (isDragging) return 'grabbing';
            if (isHovering) return 'pointer';
            return 'grab';
          }}
        />
      ) : (
        <div className="deck-map-webgl-fallback">
          WebGL is unavailable in this browser session. Open the app in a browser with WebGL enabled to use the interactive map.
        </div>
      )}
      {popover && (
        <div
          className="map-airport-html-popover"
          style={{ left: popover.x + 12, top: popover.y - 76 }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="map-airport-html-title">
            {popover.airport.iata} · {popover.airport.city}
          </div>
          <div className="map-airport-html-route">{airportActionLabel(popover.airport)}</div>
          {airportCanCommit(popover.airport) ? (
            <button
              type="button"
              className="map-airport-html-button"
              onClick={() => {
                onAirportCommit?.(popover.airport);
                setPopover(null);
              }}
            >
              Add to route
            </button>
          ) : (
            <div className="map-airport-html-muted">Current endpoint</div>
          )}
        </div>
      )}
      {worldError && <div className="deck-map-error">World outline unavailable</div>}
    </div>
  );
}
