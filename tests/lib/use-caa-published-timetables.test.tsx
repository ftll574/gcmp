import { readFileSync } from 'node:fs';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useCaaPublishedTimetables } from '../../src/lib/use-caa-published-timetables.ts';

const shard = readFileSync('public/data/published-timetables/caa/KHH-MNL.json', 'utf8');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('fetches published CAA route shards under the configured GitHub Pages base', async () => {
  vi.stubEnv('BASE_URL', '/gcmp/');
  const fetch = vi.fn(async () => new Response(shard));
  vi.stubGlobal('fetch', fetch);

  const { result } = renderHook(() => useCaaPublishedTimetables('KHH-MNL'));
  await waitFor(() => expect(result.current.status).toBe('ready'));

  expect(String(fetch.mock.calls[0]?.[0])).toBe('/gcmp/data/published-timetables/caa/KHH-MNL.json');
  expect(result.current.shard?.pair).toEqual(['KHH', 'MNL']);
});
