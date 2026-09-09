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

  fireEvent.click(screen.getByRole('button', { name: '開始規劃 →' }));
  await waitFor(() => expect(document.querySelector('.rtw-gate')).not.toBeNull(), { timeout: 5_000 });
  expect(new URLSearchParams(window.location.search).get('view')).toBe('planner');
});

test('homepage showcases can rotate without loading planner data', async () => {
  render(<SiteApp />);
  await screen.findByText('BR184');
  fireEvent.click(screen.getByRole('button', { name: /02.*oneworld 城市樞紐環球/ }));
  expect(await screen.findByText('CX407')).toBeInTheDocument();
  expect(screen.getByText('CX237')).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).toEqual(['/data/site/landing-showcases.json']);
});

test('route library is a separate page and keeps the heavy catalog out of the homepage', async () => {
  render(<SiteApp />);
  await screen.findByRole('heading', { name: /把世界變成一條/ });
  expect(screen.queryByText('全球航網，一張地圖看懂。')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '瀏覽所有航線' }));
  expect(await screen.findByRole('heading', { name: '全球航網，一張地圖看懂。' })).toBeInTheDocument();
  expect(await screen.findByRole('img', { name: 'Route network map' })).toBeInTheDocument();
  expect(screen.queryByText('不要翻資料庫，直接探索航網。')).not.toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('view')).toBe('routes');
});

test('route library searches a confirmed flight and hands it to the planner', async () => {
  render(<SiteApp />);
  await screen.findByRole('heading', { name: /把世界變成一條/ });
  fireEvent.click(screen.getByRole('button', { name: '瀏覽所有航線' }));
  await screen.findByRole('heading', { name: '全球航網，一張地圖看懂。' });

  const search = await screen.findByRole('searchbox', { name: /搜尋機場、城市、航空公司、航線或班號/ });
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

test('site navigation remains available after entering the planner and returns to public pages', async () => {
  render(<SiteApp />);
  await screen.findByRole('heading', { name: /把世界變成一條/ });
  fireEvent.click(screen.getByRole('button', { name: '開始規劃 →' }));
  await waitFor(() => expect(document.querySelector('.rtw-gate')).not.toBeNull(), { timeout: 5_000 });

  const plannerNav = screen.getByRole('navigation', { name: 'Primary navigation' });
  expect(within(plannerNav).getByRole('button', { name: '規劃' })).toHaveClass('active');
  fireEvent.click(within(plannerNav).getByRole('button', { name: '首頁' }));
  expect(await screen.findByRole('heading', { name: /把世界變成一條/ })).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('view')).toBe('home');

  const homeNav = screen.getByRole('navigation', { name: 'Primary navigation' });
  fireEvent.click(within(homeNav).getByRole('button', { name: '航線資料庫' }));
  expect(await screen.findByRole('heading', { name: '全球航網，一張地圖看懂。' })).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('view')).toBe('routes');
});

test('legacy share hashes still bypass the homepage and open the planner', async () => {
  window.history.replaceState({}, '', '/#/r/v1/TPE-NRT?op=BR&p=BR&c=J&rv=2026.4');
  render(<SiteApp />);
  await waitFor(() => expect(document.querySelector('.route-plan-bar')).not.toBeNull());
  expect(document.querySelector('.landing-page')).toBeNull();
});
