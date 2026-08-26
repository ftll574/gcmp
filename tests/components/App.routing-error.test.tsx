/**
 * Integration tests: a corrupted share-URL must surface its typed parse
 * error as the ⚠ banner instead of silently resetting to the empty planner.
 *
 * Regression (2026-08-26): App's default-product effect called setRouting
 * on mount whenever rtwProductId was undefined — which is exactly the state
 * after a failed parse — and use-routing-state's setState wiped `error`.
 * The banner rendered for one frame, then vanished: users saw a silent
 * blank planner. These tests drive the FULL <App> with a stubbed fetch
 * serving the real public/data files, so both the hook and the effect run
 * for real.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../../src/App.tsx';
import { PROGRAM_REGISTRY } from '../../src/lib/types.ts';

const PUBLIC = join(process.cwd(), 'public');

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => serveFromPublic(String(input))));
  // jsdom has no ResizeObserver; App's map-size effect needs one.
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

/** Map an app fetch URL ("/data/...") to public/data on disk; 404 otherwise. */
function serveFromPublic(url: string): { ok: boolean; status: number; json: () => Promise<unknown> } {
  const pathOnly = url.split('?')[0] ?? url;
  if (!pathOnly.startsWith('/data/') || !pathOnly.endsWith('.json')) {
    return { ok: false, status: 404, json: async () => undefined };
  }
  const file = join(PUBLIC, pathOnly);
  if (!existsSync(file)) {
    return { ok: false, status: 404, json: async () => undefined };
  }
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(readFileSync(file, 'utf8')),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('corrupted share-URL handling', () => {
  test('bad hash shows the typed parse error banner AND it survives mount', async () => {
    // Two defects in one link: missing "-" between YVR/HKG, broken date.
    window.location.hash =
      '#/r/v1/TPE-HKG-LHR-JFK-YVRHKG-TPE?op=CX,BR,CX,CX,CX,CX&p=CX&c=J&stp=1,1,1,1,1,1&fc=J,J,J,J,J,J&d=2026-10-05,2026-10-07&rtw=cx-asia-miles-oneworld-multi-carrier-award';

    render(<App />);

    // The engine's typed error reaches the DOM...
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert.textContent).toContain('Invalid IATA code');
    expect(alert.textContent).toContain('YVRHKG');

    // ...and STAYS. This is the regression pin: before the fix, the
    // default-product effect wiped `routing.error` right after mount and
    // the banner disappeared, leaving a silent blank planner.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getByRole('alert').textContent).toContain('YVRHKG');
  });

  test('a healthy share-URL still loads legs and shows no error banner', async () => {
    window.location.hash =
      '#/r/v1/TPE-HKG-LHR?op=CX,CX&p=CX&c=J&stp=1,0&d=2026-10-05,2026-10-07';

    render(<App />);

    // Legs materialize as per-leg carrier combos (locale defaults to en).
    await waitFor(
      () => {
        const combos = screen.getAllByRole('combobox');
        expect(combos.length).toBeGreaterThanOrEqual(4);
      },
      { timeout: 5000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('date-shape defect reports its own message', async () => {
    window.location.hash =
      '#/r/v1/TPE-HKG-LHR?op=CX,CX&p=CX&c=J&d=2026-10-05,202610-07';

    render(<App />);

    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert.textContent).toContain('Invalid departure date');
    expect(alert.textContent).toContain('202610-07');
  });
});

// Keep the registry import used: documents that program dirs are fetched
// dynamically by the loader; the stub serves whichever exist on disk.
void PROGRAM_REGISTRY;
