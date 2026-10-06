import { useCallback, useEffect, useState } from 'react';
import { parseCaaWeeklyScheduleTier, type CaaWeeklyScheduleTier } from './schemas/caa-weekly-schedule-tier.ts';
import { siteAssetHref } from './site-navigation.ts';

const ASSET = 'data/route-network/caa-weekly-schedule-tier-20261006.json';
let cached: CaaWeeklyScheduleTier | null = null;
let pending: Promise<CaaWeeklyScheduleTier> | null = null;

export type CaaWeeklyScheduleTierState =
  | { readonly status: 'loading'; readonly data: null; readonly retry: () => void }
  | { readonly status: 'ready'; readonly data: CaaWeeklyScheduleTier; readonly retry: () => void }
  | { readonly status: 'error'; readonly data: null; readonly error: string; readonly retry: () => void };

async function loadTier(): Promise<CaaWeeklyScheduleTier> {
  if (cached) return cached;
  if (!pending) {
    pending = fetch(siteAssetHref(ASSET))
      .then(async response => {
        if (!response.ok) throw new Error(`CAA weekly timetable returned HTTP ${response.status}`);
        const tier = parseCaaWeeklyScheduleTier(await response.json());
        cached = tier;
        return tier;
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

/** Lazily fetch the source-listed schedule tier; it is never joined to flight selection. */
export function useCaaWeeklyScheduleTier(enabled: boolean): CaaWeeklyScheduleTierState {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback((): void => setAttempt(value => value + 1), []);
  const [state, setState] = useState<CaaWeeklyScheduleTierState>(() => ({ status: 'loading', data: null, retry }));
  useEffect(() => {
    if (!enabled) return;
    if (cached) return;
    let mounted = true;
    void loadTier()
      .then(data => { if (mounted) setState({ status: 'ready', data, retry }); })
      .catch(error => {
        if (mounted) setState({
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'CAA weekly timetable unavailable',
          retry,
        });
      });
    return () => { mounted = false; };
  }, [attempt, enabled, retry]);
  if (!enabled) return { status: 'loading', data: null, retry };
  return cached ? { status: 'ready', data: cached, retry } : state;
}
