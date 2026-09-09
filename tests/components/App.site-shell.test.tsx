import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App.tsx';
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
  render(<App />);
  expect(await screen.findByRole('heading', { name: /把世界變成一條/ })).toBeInTheDocument();
  expect(document.querySelector('.landing-map-card animateMotion')).not.toBeNull();
  expect(screen.queryByText('先選聯盟與開票方案')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '開始規劃 →' }));
  await waitFor(() => expect(document.querySelector('.rtw-gate')).not.toBeNull());
  expect(new URLSearchParams(window.location.search).get('view')).toBe('planner');
});

test('route library is a separate page and keeps the heavy catalog out of the homepage', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: /把世界變成一條/ });
  expect(screen.queryByText('我們目前知道的世界航線。')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '瀏覽所有航線' }));
  expect(await screen.findByRole('heading', { name: '我們目前知道的世界航線。' })).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('view')).toBe('routes');
});

test('legacy share hashes still bypass the homepage and open the planner', async () => {
  window.history.replaceState({}, '', '/#/r/v1/TPE-NRT?op=BR&p=BR&c=J&rv=2026.4');
  render(<App />);
  await waitFor(() => expect(document.querySelector('.route-plan-bar')).not.toBeNull());
  expect(document.querySelector('.landing-page')).toBeNull();
});
