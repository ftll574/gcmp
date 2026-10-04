import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mapHarness = vi.hoisted(() => ({
  instance: null as null | { handlers: Map<string, (event: unknown) => void>; emit: (event: string, payload: unknown) => void },
  dispatchAirport: false,
}));

vi.mock('maplibre-gl', () => {
  class MockMap {
    handlers = new Map<string, (event: unknown) => void>();
    sources = new Map<string, { setData: () => void; getClusterLeaves: () => Promise<never[]> }>();
    constructor() {
      mapHarness.instance = {
        handlers: this.handlers,
        emit: (event, payload) => this.handlers.get(event)?.(payload),
      };
    }
    on(event: string, handler: (event: unknown) => void) {
      this.handlers.set(event, handler);
      if (event === 'load') queueMicrotask(() => handler({}));
      return this;
    }
    once(event: string, handler: (event: unknown) => void) {
      queueMicrotask(() => handler({}));
      return this;
    }
    off() { return this; }
    addControl() { return this; }
    addSource(id: string) { this.sources.set(id, { setData: () => undefined, getClusterLeaves: async () => [] }); }
    getSource(id: string) { return this.sources.get(id); }
    addLayer() { return this; }
    getLayer() { return {}; }
    isStyleLoaded() { return true; }
    getCanvas() { return document.createElement('canvas'); }
    getCenter() { return { lng: 121.23, lat: 25.08 }; }
    getZoom() { return 8; }
    project() { return { x: 0, y: 0 }; }
    queryRenderedFeatures(_query: unknown, options?: { layers?: string[] }) {
      if (mapHarness.dispatchAirport && options?.layers?.includes('gcmp-airports')) {
        return [{ type: 'Feature', geometry: { type: 'Point', coordinates: [121.2328, 25.0777] }, properties: { iata: 'TPE' }, layer: { id: 'gcmp-airports' } }];
      }
      return [];
    }
    setPaintProperty() {}
    setLayoutProperty() {}
    fitBounds() {}
    easeTo() {}
    remove() {}
  }
  return { Map: MockMap, NavigationControl: class {}, AttributionControl: class {}, setWorkerUrl: vi.fn() };
});

vi.mock('../../src/state/use-world-map.ts', () => ({ useWorldMap: () => ({ features: null, error: null }) }));

import { SiteApp } from '../../src/SiteApp.tsx';
import { setLocale } from '../../src/i18n/i18n.ts';

const PUBLIC = join(process.cwd(), 'public');

beforeEach(() => {
  setLocale('zh-TW');
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes');
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 Chrome/140.0 Safari/537.36' });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    const file = join(PUBLIC, path);
    if (!path.startsWith('/data/') || !path.endsWith('.json') || !existsSync(file)) return { ok: false, status: 404, json: async () => undefined };
    const bytes = readFileSync(file);
    return { ok: true, status: 200, json: async () => JSON.parse(bytes.toString('utf8')), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  }));
  mapHarness.instance = null;
  mapHarness.dispatchAirport = false;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
  setLocale('en');
});

test('MapLibre TPE airport click selects the AllRoutesPage airport profile and updates its share URL', async () => {
  render(<SiteApp />);
  await screen.findByRole('heading', { name: '探索全球航網' }, { timeout: 15_000 });
  await waitFor(() => expect(mapHarness.instance?.handlers.has('click')).toBe(true), { timeout: 10_000 });
  mapHarness.dispatchAirport = true;
  mapHarness.instance!.emit('click', { point: { x: 0, y: 0 } });
  await screen.findByRole('heading', { name: /TPE.*Taoyuan/ }, { timeout: 10_000 });
  expect(new URLSearchParams(window.location.search).get('entity')).toBe('airport');
  expect(new URLSearchParams(window.location.search).get('id')).toBe('TPE');
  expect(screen.getByText('目的地列表 · 92')).toBeInTheDocument();
}, 20_000);
