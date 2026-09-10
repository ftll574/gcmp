import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SiteApp } from '../../src/SiteApp.tsx';
import { setLocale } from '../../src/i18n/i18n.ts';

const PUBLIC = join(process.cwd(), 'public');

beforeEach(() => {
  setLocale('zh-TW');
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0] ?? '';
    const file = join(PUBLIC, path);
    if (!path.startsWith('/data/') || !path.endsWith('.json') || !existsSync(file)) {
      return { ok: false, status: 404, json: async () => undefined };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(file, 'utf8')) };
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
  await waitFor(() => expect(document.querySelector('[data-three-globe], [data-three-fallback]')).not.toBeNull());
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
  fireEvent.click(startPlanning);
  await waitFor(() => expect(document.querySelector('.rtw-gate')).not.toBeNull(), { timeout: 5_000 });
  expect(new URLSearchParams(window.location.search).get('view')).toBe('planner');
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
  expect(await screen.findByRole('region', { name: '航線地圖' })).toBeInTheDocument();
  expect(document.querySelector('.routes-alliance-tabs')).toBeNull();
  const map = document.querySelector('.entity-map-card');
  expect(map?.querySelector('[aria-label="Alliance filter"], [aria-label="航空聯盟篩選"]')).not.toBeNull();
  expect(map?.querySelector('input[type="search"]')).not.toBeNull();
  expect(screen.queryByText('不要翻資料庫，直接探索航網。')).not.toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('view')).toBe('routes');
});

test('route library searches a confirmed flight and hands it to the planner', async () => {
  render(<SiteApp />);
  await screen.findByRole('heading', { name: /把世界變成一條/ });
  fireEvent.click(screen.getByRole('link', { name: '瀏覽所有航線' }));
  await screen.findByRole('heading', { name: '探索全球航網' });

  const search = await screen.findByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ });
  fireEvent.change(search, { target: { value: 'BR198' } });
  const result = await screen.findByRole('option', { name: /BR198 · TPE → NRT/ });
  fireEvent.click(result);

  expect(await screen.findByRole('heading', { name: /TPE.*→.*NRT/ })).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('entity')).toBe('route');
  expect(new URLSearchParams(window.location.search).get('id')).toBe('TPE-NRT');

  fireEvent.click(await screen.findByRole('button', { name: 'BR198' }));
  await waitFor(() => expect(document.querySelector('.route-plan-bar')).not.toBeNull(), { timeout: 5_000 });
  expect(new URLSearchParams(window.location.search).get('view')).toBe('planner');
  expect(window.location.hash).toContain('TPE-NRT');
  expect(window.location.hash).toContain('fn=198');
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

  expect(await screen.findByRole('heading', { name: /TPE.*Taoyuan/ })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /搜尋機場、城市、航空公司、航線或班號/ })).toHaveValue('TPE');
  expect(screen.getByRole('button', { name: 'Star' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /收起詳細篩選/ })).toHaveAttribute('aria-expanded', 'true');
});

test('site navigation remains available after entering the planner and returns to public pages', async () => {
  render(<SiteApp />);
  await screen.findByRole('heading', { name: /把世界變成一條/ });
  fireEvent.click(screen.getByRole('link', { name: '開始規劃' }));
  await waitFor(() => expect(document.querySelector('.rtw-gate')).not.toBeNull(), { timeout: 5_000 });

  const plannerNav = screen.getByRole('navigation', { name: '主要導覽' });
  expect(within(plannerNav).getByRole('link', { name: '規劃' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(within(plannerNav).getByRole('link', { name: '首頁' }));
  expect(await screen.findByRole('heading', { name: /把世界變成一條/ })).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('view')).toBe('home');

  const homeNav = screen.getByRole('navigation', { name: '主要導覽' });
  fireEvent.click(within(homeNav).getByRole('link', { name: '航線資料庫' }));
  expect(await screen.findByRole('heading', { name: '探索全球航網' })).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('view')).toBe('routes');
});

test('legacy share hashes still bypass the homepage and open the planner', async () => {
  window.history.replaceState({}, '', '/#/r/v1/TPE-NRT?op=BR&p=BR&c=J&rv=2026.4');
  render(<SiteApp />);
  await waitFor(() => expect(document.querySelector('.route-plan-bar')).not.toBeNull());
  expect(document.querySelector('.landing-page')).toBeNull();
});
