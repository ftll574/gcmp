/**
 * Lazy-loads the world-countries TopoJSON (~25KB gzipped) and converts it
 * to GeoJSON FeatureCollection ready for d3-geoPath rendering.
 *
 * Fetched once on first map render in the user's session. Cached in module
 * scope so subsequent renders are instant.
 */

import { useSyncExternalStore } from 'react';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

export type WorldFeatures = FeatureCollection<Geometry>;

interface Snapshot {
  features: WorldFeatures | null;
  error: string | null;
}

let snapshot: Snapshot = { features: null, error: null };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function startLoad(baseUrl: string): void {
  if (snapshot.features || inFlight) return;
  inFlight = (async () => {
    try {
      const res = await fetch(`${baseUrl}/data/world-countries-110m.json`);
      if (!res.ok) throw new Error(`World atlas fetch failed: HTTP ${res.status}`);
      const topo = (await res.json()) as unknown;
      const topoTyped = topo as Parameters<typeof feature>[0];
      const countriesKey: Parameters<typeof feature>[1] = 'countries';
      const fc = feature(topoTyped, countriesKey) as unknown as FeatureCollection<Geometry>;
      snapshot = { features: fc, error: null };
    } catch (e) {
      snapshot = {
        features: null,
        error: e instanceof Error ? e.message : String(e),
      };
    } finally {
      inFlight = null;
      notify();
    }
  })();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // Kick off the fetch on first subscribe — runs at most once.
  startLoad(import.meta.env.BASE_URL.replace(/\/$/, ''));
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

export function useWorldMap(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type { Feature };
