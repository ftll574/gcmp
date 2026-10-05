import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SiteApp } from '../../src/SiteApp.tsx';
import { setLocale } from '../../src/i18n/i18n.ts';
import type { RouteNetworkCatalog } from '../../src/lib/schemas/route-network.ts';

const PUBLIC = join(process.cwd(), 'public');

function carrierShardFixture(carrier: string): { readonly manifest: unknown; readonly bytes: Buffer } {
  const runtime = JSON.parse(readFileSync(join(PUBLIC, 'data/route-network/runtime-current.json'), 'utf8')) as RouteNetworkCatalog;
  const runtimeMeta = JSON.parse(readFileSync(join(PUBLIC, 'data/route-network/runtime-current.meta.json'), 'utf8')) as { outputSha256: string };
  const routes = runtime.routes.filter((route) => route.status === 'published' && route.carrier === carrier);
  const carrierUniverses = runtime.carrierUniverses.filter((universe) => universe.carrier === carrier);
  const sourceIds = new Set([
    ...routes.flatMap((route) => [
      ...route.sourceIds,
      ...(route.flightNumberSourceIds ?? []),
      ...(route.flightNumberCandidateSourceIds ?? []),
    ]),
    ...carrierUniverses.flatMap((universe) => universe.sourceIds),
  ]);
  const shard: RouteNetworkCatalog = {
    version: runtime.version,
    coverage: runtime.coverage,
    sources: runtime.sources.filter((source) => sourceIds.has(source.id)),
    carrierUniverses,
    routes,
  };
  const text = `${JSON.stringify(shard)}\n`;
  const bytes = Buffer.from(text);
  return {
    bytes,
    manifest: {
      version: 1,
      runtimeSha256: runtimeMeta.outputSha256,
      carriers: {
        [carrier]: {
          routes: routes.length,
          bytes: bytes.byteLength,
          sha256: createHash('sha256').update(text).digest('hex'),
        },
      },
    },
  };
}

function jsonResponse(value: unknown): Response {
  return { ok: true, status: 200, json: async () => value } as Response;
}

function bufferResponse(bytes: Buffer): Response {
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(bytes.toString('utf8')),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  } as Response;
}

beforeEach(() => {
  setLocale('zh-TW');
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    const file = join(PUBLIC, path);
    if (!path.startsWith('/data/') || !path.endsWith('.json') || !existsSync(file)) {
      return { ok: false, status: 404, json: async () => undefined, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const bytes = readFileSync(file);
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(bytes.toString('utf8')),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
  setLocale('en');
});

test('fresh visits land on the editorial homepage before entering the planner', async () => {
  render(<SiteApp />);
  expect(await screen.findByRole('heading', { name: /把世界變成一條/ })).toBeInTheDocument();
  await waitFor(() => expect(document.querySelector('[data-three-globe], [data-three-fallback]')).not.toBeNull(), { timeout: 4_000 });
  expect(await screen.findByText('BR184')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Star Alliance 經典環球|oneworld 城市樞紐環球|SkyTeam 跨洲接力|台灣出發長程四段/ })).toHaveLength(4);
  expect(screen.queryByText('先選聯盟與開票方案')).not.toBeInTheDocument();

  const requestedBeforePlanner = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
  expect(requestedBeforePlanner).toEqual(['/data/site/landing-showcases.json']);
  expect(requestedBeforePlanner.some((url) => url.includes('/programs/'))).toBe(false);
  expect(requestedBeforePlanner.some((url) => url.includes('/rtw-products/'))).toBe(false);

  const startPlanning = screen.getByRole('link', { name: '開始規劃' });
  expect(startPlanning).toHaveAttribute('href', expect.stringContaining('view=planner'));
  expect(screen.getByRole('link', { name: '跳到主要內容' })).toHaveAttribute('href', '#main-content');
  expect(document.querySelector('.landing-stats')).toBeNull();
  fireEvent.click(startPlanning);
  await waitFor(() => expect(document.querySelector('.rtw-gate')).not.toBeNull(), { timeout: 5_000 });
  expect(new URLSearchParams(window.location.search).get('view')).toBe('planner');
});

test('entering the planner from a long mobile gate resets the document scroll to the editor', async () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
  render(<SiteApp />);
  fireEvent.click(screen.getByRole('link', { name: '開始規劃' }));
  await waitFor(() => expect(document.querySelector('.rtw-gate')).not.toBeNull(), { timeout: 5_000 });
  const scrollTo = vi.mocked(window.scrollTo);
  scrollTo.mockClear();
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="star"]')!);
  await waitFor(() => expect(document.querySelector('[data-product-id="br-infinity-star-alliance-world-travel-award"]')).toBeInTheDocument());
  const plan = document.querySelector<HTMLButtonElement>('[data-product-id="br-infinity-star-alliance-world-travel-award"]')!;
  fireEvent.click(plan);
  fireEvent.click(screen.getByRole('button', { name: /使用這個方案進入主控台/ }));
  await waitFor(() => expect(document.querySelector('#route-editor')).toBeInTheDocument(), { timeout: 5_000 });
  await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' }));
  await waitFor(() => expect(document.activeElement).toBe(document.querySelector('.autocomplete-input')));
});

test('homepage showcases can rotate without loading planner data', async () => {
  render(<SiteApp />);
  await screen.findByText('BR184');
  fireEvent.click(screen.getByRole('button', { name: 'oneworld 城市樞紐環球' }));
  expect(await screen.findByText('CX407')).toBeInTheDocument();
  expect(screen.getByText('CX237')).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).toEqual(['/data/site/landing-showcases.json']);
});

test('route library is a separate page and keeps the heavy catalog out of the homepage', async () => {
  render(<SiteApp />);
  await screen.findByRole('heading', { name: /把世界變成一條/ });
  expect(screen.queryByText('探索全球航網')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: '瀏覽所有航線' }));
  expect(await screen.findByRole('heading', { name: '探索全球航網' })).toBeInTheDocument();
  expect(await screen.findByRole('region', { name: '航線地圖' }, { timeout: 5_000 })).toBeInTheDocument();
  expect(document.querySelector('.entity-map-preview-stats')).toBeNull();
  expect(document.querySelector('.routes-alliance-tabs')).toBeNull();
  const map = document.querySelector('.entity-map-card');
  expect(map?.querySelector('[aria-label="Alliance filter"], [aria-label="航空聯盟篩選"]')).not.toBeNull();
  expect(map?.querySelector('input[type="search"]')).not.toBeNull();
  expect(screen.queryByText('不要翻資料庫，直接探索航網。')).not.toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('view')).toBe('routes');
  const routeRequests = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
  expect(routeRequests.some((url) => url.includes('/programs/'))).toBe(false);
  expect(routeRequests.some((url) => url.includes('/rtw-products/'))).toBe(false);
  expect(routeRequests.some((url) => url.includes('/award-pricing/'))).toBe(false);
  expect(routeRequests.some((url) => url.includes('/markets/'))).toBe(false);
});

test('route library reports a core data failure without loading planner datasets', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes');
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    if (path === '/data/airports.json') {
      return { ok: false, status: 503, json: async () => undefined } as Response;
    }
    const file = join(PUBLIC, path);
    if (!path.startsWith('/data/') || !path.endsWith('.json') || !existsSync(file)) {
      return { ok: false, status: 404, json: async () => undefined, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
    }
    const bytes = readFileSync(file);
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(bytes.toString('utf8')),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as Response;
  });

  render(<SiteApp />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Fetch /data/airports.json failed: HTTP 503');
  const routeRequests = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
  expect(routeRequests.some((url) => url.includes('/programs/'))).toBe(false);
  expect(routeRequests.some((url) => url.includes('/rtw-products/'))).toBe(false);
});

test('route library falls back to canonical shard parsing when Web Crypto is unavailable', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes&entity=airport&id=TPE');
  vi.stubGlobal('crypto', {});

  render(<SiteApp />);
  expect(await screen.findByRole('heading', { name: /TPE.*Taoyuan/ }, { timeout: 5_000 })).toBeInTheDocument();
  expect(await screen.findByRole('combobox', { name: /搜尋機場、城市/ }, { timeout: 5_000 })).toBeEnabled();
  expect(screen.getByText(/已完整載入此機場的出發航線/)).toBeInTheDocument();
});

test('advanced route data failure does not take down the core route library', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes&advanced=1&entity=airport&id=TPE');
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    if (path === '/data/official-schedules.json') {
      return { ok: false, status: 503, json: async () => undefined } as Response;
    }
    const file = join(PUBLIC, path);
    if (!path.startsWith('/data/') || !path.endsWith('.json') || !existsSync(file)) {
      return { ok: false, status: 404, json: async () => undefined, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
    }
    const bytes = readFileSync(file);
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(bytes.toString('utf8')),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as Response;
  });

  render(<SiteApp />);
  expect(await screen.findByRole('heading', { name: /TPE.*Taoyuan/ }, { timeout: 5_000 })).toBeInTheDocument();
  expect(await screen.findByText('詳細航線資料載入失敗', {}, { timeout: 5_000 })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重新載入' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /TPE.*Taoyuan/ })).toBeInTheDocument();
});

test('route library searches a designator but cannot persist its unverified operator', async () => {
  render(<SiteApp />);
  await screen.findByRole('heading', { name: /把世界變成一條/ });
  fireEvent.click(screen.getByRole('link', { name: '瀏覽所有航線' }));
  await screen.findByRole('heading', { name: '探索全球航網' });

  const search = await screen.findByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ });
  fireEvent.change(search, { target: { value: 'BR198' } });
  expect(await screen.findByText(/完整航網尚未搜尋/)).toBeInTheDocument();
  expect(screen.queryByText('完整航網搜尋完成，沒有符合的結果。')).not.toBeInTheDocument();
  fireEvent.click(document.querySelector('.entity-map-full-search')!);
  const result = await screen.findByRole('option', { name: /BR198 · TPE → NRT/ });
  fireEvent.click(result);

  expect(await screen.findByRole('heading', { name: /TPE.*→.*NRT/ })).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('entity')).toBe('route');
  expect(new URLSearchParams(window.location.search).get('id')).toBe('TPE-NRT');

  expect(screen.queryByRole('button', { name: 'BR198' })).not.toBeInTheDocument();
  expect(document.querySelector('[data-select-flight-number="BR198"]')).toBeNull();
  expect(new URLSearchParams(window.location.search).get('view')).toBe('routes');
  expect(window.location.hash).not.toContain('fn=198');

  fireEvent.change(screen.getByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ }), { target: { value: 'ZZ9999' } });
  expect(await screen.findByText('完整航網搜尋完成，沒有符合的結果。')).toBeInTheDocument();
});

test('partial flight hits stay labeled partial and full search adds global matches', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes');
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  let releaseRuntime!: (response: Response) => void;
  const runtimeGate = new Promise<Response>((resolve) => { releaseRuntime = resolve; });
  let runtimeRequested = false;
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    if (path === '/data/route-network/runtime-current.json') {
      runtimeRequested = true;
      return runtimeGate;
    }
    return originalFetch!(input);
  });

  render(<SiteApp />);
  const search = await screen.findByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ });
  fireEvent.change(search, { target: { value: 'BR1' } });
  expect(await screen.findByRole('option', { name: /BR184 · TPE → NRT/ })).toBeInTheDocument();
  expect(screen.getByText(/部分搜尋結果：1 筆/)).toBeInTheDocument();
  expect(screen.getByText(/示例候選班號，尚未確認/)).toBeInTheDocument();
  const previewCount = screen.getAllByRole('option').length;

  const fullSearch = document.querySelector('.entity-map-full-search');
  expect(fullSearch).toBeInTheDocument();
  fireEvent.click(fullSearch!);
  await waitFor(() => expect(runtimeRequested).toBe(true));
  expect(screen.getByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ })).toHaveValue('BR1');
  expect(screen.getByText('正在搜尋完整航網…')).toBeInTheDocument();
  expect(fullSearch).toBeDisabled();

  const bytes = readFileSync(join(PUBLIC, 'data/route-network/runtime-current.json'));
  releaseRuntime({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as Response);
  expect(await screen.findByRole('option', { name: /BR1 · LAX → TPE/ })).toBeInTheDocument();
  expect(screen.getAllByRole('option').length).toBeGreaterThan(previewCount);
  expect(screen.queryByText(/部分搜尋結果/)).not.toBeInTheDocument();
});

test('empty partial BR198 search is not reported as a global no-match and can retry after failure', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes');
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  let attempts = 0;
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    if (path === '/data/route-network/runtime-current.json') {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
    }
    return originalFetch!(input);
  });

  render(<SiteApp />);
  const search = await screen.findByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ });
  fireEvent.change(search, { target: { value: 'BR198' } });
  expect(await screen.findByText(/完整航網尚未搜尋/)).toBeInTheDocument();
  expect(screen.queryByText('完整航網搜尋完成，沒有符合的結果。')).not.toBeInTheDocument();
  expect(search).toHaveValue('BR198');

  fireEvent.click(document.querySelector('.entity-map-full-search')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('完整航網搜尋失敗');
  expect(screen.getByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ })).toHaveValue('BR198');
  expect(new URLSearchParams(window.location.search).get('q')).toBe('BR198');
  expect(document.querySelector('.entity-map-full-search')).toHaveTextContent('重試完整搜尋');

  fireEvent.click(document.querySelector('.entity-map-full-search')!);
  expect(await screen.findByRole('option', { name: /BR198 · TPE → NRT/ })).toBeInTheDocument();
  expect(attempts).toBe(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('q')).toBe('BR198');
});

test('late full-network response preserves newer URL query, alliance filter and selection', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes&alliance=star#share-state');
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  let releaseRuntime!: (response: Response) => void;
  const runtimeGate = new Promise<Response>((resolve) => { releaseRuntime = resolve; });
  let runtimeRequested = false;
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    if (path === '/data/route-network/runtime-current.json') {
      runtimeRequested = true;
      return runtimeGate;
    }
    return originalFetch!(input);
  });

  render(<SiteApp />);
  const search = await screen.findByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ });
  fireEvent.change(search, { target: { value: 'TPE' } });
  fireEvent.click(document.querySelector('.entity-map-full-search')!);
  await waitFor(() => expect(runtimeRequested).toBe(true));

  fireEvent.click(screen.getByRole('button', { name: 'oneworld' }));
  fireEvent.click(await screen.findByRole('option', { name: /TPE · Taoyuan/ }));
  expect(new URLSearchParams(window.location.search).get('entity')).toBe('airport');
  expect(new URLSearchParams(window.location.search).get('alliance')).toBe('oneworld');
  expect(window.location.hash).toBe('#share-state');

  const bytes = readFileSync(join(PUBLIC, 'data/route-network/runtime-current.json'));
  releaseRuntime({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as Response);
  expect(await screen.findByText('抵達方向航線')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ })).toHaveValue('TPE');
  expect(new URLSearchParams(window.location.search).get('q')).toBe('TPE');
  expect(new URLSearchParams(window.location.search).get('alliance')).toBe('oneworld');
  expect(new URLSearchParams(window.location.search).get('entity')).toBe('airport');
  expect(new URLSearchParams(window.location.search).get('id')).toBe('TPE');
  expect(window.location.hash).toBe('#share-state');
});

test('route library keeps the searched airport selected while comparing alliances', async () => {
  render(<SiteApp />);
  await screen.findByRole('heading', { name: /把世界變成一條/ });
  fireEvent.click(screen.getByRole('link', { name: '瀏覽所有航線' }));
  await screen.findByRole('heading', { name: '探索全球航網' });

  const search = await screen.findByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ });
  fireEvent.change(search, { target: { value: 'TPE' } });
  fireEvent.click(await screen.findByRole('option', { name: /TPE · Taoyuan/ }));
  expect(await screen.findByRole('heading', { name: /TPE.*Taoyuan/ })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ })).toHaveValue('TPE');

  const map = document.querySelector('.entity-map-card');
  const allianceControls = map?.querySelector('[aria-label="Alliance filter"], [aria-label="航空聯盟篩選"]');
  expect(allianceControls).not.toBeNull();
  fireEvent.click(within(allianceControls as HTMLElement).getByRole('button', { name: 'Star' }));

  await waitFor(() => expect(document.querySelector('.entity-map-card')?.getAttribute('data-map-alliance')).toBe('star'));
  expect(new URLSearchParams(window.location.search).get('alliance')).toBe('star');
  expect(new URLSearchParams(window.location.search).get('q')).toBe('TPE');
  expect(new URLSearchParams(window.location.search).get('entity')).toBe('airport');
  expect(new URLSearchParams(window.location.search).get('id')).toBe('TPE');
  expect(screen.getByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ })).toHaveValue('TPE');
  expect(await screen.findByRole('heading', { name: /TPE.*Taoyuan/ })).toBeInTheDocument();
});

test('route library restores shareable search, alliance, entity and advanced-filter state', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes&alliance=star&q=TPE&advanced=1&entity=airport&id=TPE');
  render(<SiteApp />);

  // This cold integration path parses the multi-megabyte runtime graph from
  // disk in jsdom. Correctness should not depend on Testing Library's 1s
  // default; route-load performance is measured separately in the browser.
  expect(await screen.findByRole('heading', { name: /TPE.*Taoyuan/ }, { timeout: 5_000 })).toBeInTheDocument();
  expect(await screen.findByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ }, { timeout: 5_000 })).toHaveValue('TPE');
  expect(screen.getByRole('button', { name: 'Star' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /收起詳細篩選/ })).toHaveAttribute('aria-expanded', 'true');
});

test('airport deep-links use an origin shard and load inbound statistics only on demand', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes&entity=airport&id=TPE');
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  const requests: string[] = [];
  let releaseRuntime!: () => void;
  const runtimeGate = new Promise<void>((resolve) => { releaseRuntime = resolve; });
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    requests.push(path);
    if (path === '/data/route-network/runtime-current.json') await runtimeGate;
    return originalFetch!(input);
  });

  render(<SiteApp />);
  expect(await screen.findByRole('heading', { name: /TPE.*Taoyuan/ }, { timeout: 5_000 })).toBeInTheDocument();
  expect(screen.getAllByText('Taiwan Taoyuan International Airport').length).toBeGreaterThan(0);
  expect(await screen.findByRole('region', { name: '航線地圖' }, { timeout: 5_000 })).toBeInTheDocument();
  expect(requests).toContain('/data/route-network/runtime-origins/T.json');
  expect(requests).not.toContain('/data/route-network/runtime-current.json');
  expect(screen.getByText(/已完整載入此機場的出發航線/)).toBeInTheDocument();
  expect(screen.queryByText('抵達方向航線')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /搜尋機場、城市/ })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: '補上抵達統計' }));
  await waitFor(() => expect(requests).toContain('/data/route-network/runtime-current.json'), { timeout: 5_000 });
  releaseRuntime();
  expect(await screen.findByText('抵達方向航線', {}, { timeout: 5_000 })).toBeInTheDocument();
});

test('airport search works before the full route network finishes loading', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes');
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  let releaseRuntime!: () => void;
  const runtimeGate = new Promise<void>((resolve) => { releaseRuntime = resolve; });
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    if (path === '/data/route-network/runtime-current.json') await runtimeGate;
    return originalFetch!(input);
  });

  render(<SiteApp />);
  const search = await screen.findByRole('combobox', { name: /搜尋機場、城市/ }, { timeout: 5_000 });
  fireEvent.change(search, { target: { value: 'TYO' } });
  const narita = await screen.findByRole('option', { name: /NRT.*Narita/ });
  fireEvent.click(narita);
  expect(new URLSearchParams(window.location.search).get('entity')).toBe('airport');
  expect(new URLSearchParams(window.location.search).get('id')).toBe('NRT');
  expect(screen.getByText('NRT · Narita')).toBeInTheDocument();

  releaseRuntime();
  expect(await screen.findByRole('region', { name: '航線地圖' }, { timeout: 5_000 })).toBeInTheDocument();
});

test('route deep-links show their requested entity before core route data is ready', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes&entity=route&id=TPE-NRT');
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  let releaseAirports!: () => void;
  const airportGate = new Promise<void>((resolve) => { releaseAirports = resolve; });
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    if (path === '/data/airports.json') await airportGate;
    return originalFetch!(input);
  });

  render(<SiteApp />);
  expect(await screen.findByText('TPE → NRT', {}, { timeout: 5_000 })).toBeInTheDocument();
  expect(screen.getByText(/先建立頁面，航網資料會接著補上/)).toBeInTheDocument();
  releaseAirports();
  await waitFor(() => expect(screen.getByText('Taoyuan → Narita')).toBeInTheDocument(), { timeout: 5_000 });
});

test('route deep-links use an origin shard before requesting the full global graph', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes&entity=route&id=TPE-NRT');
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  const requests: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    requests.push(path);
    return originalFetch!(input);
  });

  render(<SiteApp />);
  expect(await screen.findByRole('heading', { name: /TPE.*NRT/ }, { timeout: 5_000 })).toBeInTheDocument();
  expect(requests).toContain('/data/route-network/runtime-origins/T.json');
  expect(requests).not.toContain('/data/route-network/runtime-current.json');
  expect(screen.getByText(/已先載入這條航線/)).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /搜尋機場、城市/ })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: /返回航網/ }));
  expect(requests).not.toContain('/data/route-network/runtime-current.json');
  fireEvent.click(screen.getByRole('button', { name: '搜尋全部航線與班號' }));
  await waitFor(() => expect(requests).toContain('/data/route-network/runtime-current.json'), { timeout: 5_000 });
});

test('route shard failures fall back to the full runtime graph', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes&entity=route&id=TPE-NRT');
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  const requests: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    requests.push(path);
    if (path === '/data/route-network/runtime-origins/T.json') {
      return { ok: false, status: 503, json: async () => undefined, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
    }
    return originalFetch!(input);
  });

  render(<SiteApp />);
  expect(await screen.findByRole('heading', { name: /TPE.*NRT/ }, { timeout: 5_000 })).toBeInTheDocument();
  expect(requests).toContain('/data/route-network/runtime-origins/T.json');
  expect(requests).toContain('/data/route-network/runtime-current.json');
  expect(screen.queryByText(/已先載入這條航線/)).not.toBeInTheDocument();
});

test('airline deep-links load a carrier shard before the full global graph', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes&q=BR&entity=airline&id=BR');
  const fixture = carrierShardFixture('BR');
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  const requests: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    requests.push(path);
    if (path === '/data/route-network/runtime-carriers.meta.json') return jsonResponse(fixture.manifest);
    if (path === '/data/route-network/runtime-carriers/BR.json') return bufferResponse(fixture.bytes);
    return originalFetch!(input);
  });

  render(<SiteApp />);
  expect(await screen.findByRole('heading', { name: /BR.*EVA Air/ }, { timeout: 5_000 })).toBeInTheDocument();
  expect(requests).toContain('/data/route-network/runtime-carriers.meta.json');
  expect(requests).toContain('/data/route-network/runtime-carriers/BR.json');
  expect(requests).not.toContain('/data/route-network/runtime-current.json');
  expect(screen.getByText(/已完整載入此航空公司的航網/)).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /搜尋機場、城市/ })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: '啟用完整搜尋' }));
  await waitFor(() => expect(requests).toContain('/data/route-network/runtime-current.json'), { timeout: 5_000 });
  expect(await screen.findByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ }, { timeout: 5_000 })).toBeEnabled();
});

test('stale carrier shard metadata falls back to the full runtime graph', async () => {
  window.history.replaceState({}, '', '/?lang=zh-TW&view=routes&entity=airline&id=BR');
  const fixture = carrierShardFixture('BR');
  const staleManifest = { ...(fixture.manifest as Record<string, unknown>), runtimeSha256: '0'.repeat(64) };
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  const requests: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    requests.push(path);
    if (path === '/data/route-network/runtime-carriers.meta.json') return jsonResponse(staleManifest);
    return originalFetch!(input);
  });

  render(<SiteApp />);
  expect(await screen.findByRole('heading', { name: /BR.*EVA Air/ }, { timeout: 5_000 })).toBeInTheDocument();
  expect(requests).toContain('/data/route-network/runtime-carriers.meta.json');
  expect(requests).toContain('/data/route-network/runtime-current.json');
  expect(requests).not.toContain('/data/route-network/runtime-carriers/BR.json');
});

test('site navigation remains available after entering the planner and returns to public pages', async () => {
  render(<SiteApp />);
  await screen.findByRole('heading', { name: /把世界變成一條/ });
  fireEvent.click(screen.getByRole('link', { name: '開始規劃' }));
  await waitFor(() => expect(document.querySelector('.rtw-gate')).not.toBeNull(), { timeout: 5_000 });

  const plannerNav = screen.getByRole('navigation', { name: '主要導覽' });
  expect(within(plannerNav).getAllByRole('link')).toHaveLength(3);
  expect(within(plannerNav).queryByText(/資料進度|Data progress/)).not.toBeInTheDocument();
  expect(within(plannerNav).getByRole('link', { name: '規劃' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(within(plannerNav).getByRole('link', { name: '首頁' }));
  expect(await screen.findByRole('heading', { name: /把世界變成一條/ })).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('view')).toBe('home');

  const homeNav = screen.getByRole('navigation', { name: '主要導覽' });
  fireEvent.click(within(homeNav).getByRole('link', { name: '航線資料庫' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: '探索全球航網' })).toBeInTheDocument(), { timeout: 5_000 });
  expect(new URLSearchParams(window.location.search).get('view')).toBe('routes');
});

test('legacy progress URLs open the planner, preserve share state and have no progress navigation entry', async () => {
  window.history.replaceState({}, '', '/?view=progress&lang=zh-TW&entity=route&id=TPE-NRT#/r/v1/TPE-NRT?op=BR&p=BR&c=J');
  render(<SiteApp />);

  await waitFor(() => expect(new URLSearchParams(window.location.search).get('view')).toBe('planner'));
  expect(new URLSearchParams(window.location.search).get('lang')).toBe('zh-TW');
  expect(new URLSearchParams(window.location.search).get('entity')).toBe('route');
  expect(new URLSearchParams(window.location.search).get('id')).toBe('TPE-NRT');
  expect(window.location.hash).toBe('#/r/v1/TPE-NRT?op=BR&p=BR&c=J');
  await waitFor(() => expect(document.querySelector('.route-plan-bar, .app-error, .rtw-gate')).not.toBeNull());
  const nav = screen.getByRole('navigation', { name: '主要導覽' });
  expect(within(nav).getAllByRole('link')).toHaveLength(3);
  expect(within(nav).queryByText(/資料進度|Data progress/)).not.toBeInTheDocument();
});

test('legacy share hashes still bypass the homepage and open the planner', async () => {
  window.history.replaceState({}, '', '/#/r/v1/TPE-NRT?op=BR&p=BR&c=J&rv=2026.4');
  render(<SiteApp />);
  await waitFor(() => expect(document.querySelector('.route-plan-bar')).not.toBeNull());
  expect(document.querySelector('.landing-page')).toBeNull();
});
