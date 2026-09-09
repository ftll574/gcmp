import { useEffect, useState } from 'react';
import type { LandingShowcaseCatalog } from '../lib/schemas/landing-showcase.ts';

export type LandingLoadState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: LandingShowcaseCatalog; error: null }
  | { status: 'error'; data: null; error: string };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Lightweight runtime guard for the public homepage artifact.
 *
 * The same JSON is fully Zod-validated by the build script and test suite.
 * Keeping the browser guard dependency-free avoids pulling the entire Zod
 * vendor chunk into a fresh landing-page visit just to validate ~7 KB.
 */
function parseLandingCatalog(raw: unknown): LandingShowcaseCatalog {
  const root = record(raw);
  if (!root || root['version'] !== 1 || !Array.isArray(root['airports']) || !Array.isArray(root['showcases'])) {
    throw new Error('Invalid landing showcase catalog');
  }
  const stats = record(root['stats']);
  if (
    !stats ||
    !Number.isInteger(stats['publishedRoutes']) ||
    !Number.isInteger(stats['allianceMembers']) ||
    stats['alliances'] !== 3
  ) {
    throw new Error('Invalid landing showcase stats');
  }

  for (const value of root['airports']) {
    const airport = record(value);
    if (
      !airport ||
      typeof airport['iata'] !== 'string' ||
      typeof airport['name'] !== 'string' ||
      typeof airport['city'] !== 'string' ||
      typeof airport['country'] !== 'string' ||
      typeof airport['lat'] !== 'number' ||
      typeof airport['lon'] !== 'number'
    ) throw new Error('Invalid landing airport');
  }

  for (const value of root['showcases']) {
    const showcase = record(value);
    if (
      !showcase ||
      typeof showcase['id'] !== 'string' ||
      typeof showcase['alliance'] !== 'string' ||
      typeof showcase['titleZh'] !== 'string' ||
      typeof showcase['titleEn'] !== 'string' ||
      typeof showcase['descriptionZh'] !== 'string' ||
      typeof showcase['descriptionEn'] !== 'string' ||
      !Array.isArray(showcase['legs']) ||
      showcase['legs'].length < 2
    ) throw new Error('Invalid landing showcase');
    for (const legValue of showcase['legs']) {
      const leg = record(legValue);
      if (
        !leg ||
        typeof leg['from'] !== 'string' ||
        typeof leg['to'] !== 'string' ||
        typeof leg['carrier'] !== 'string' ||
        typeof leg['carrierName'] !== 'string' ||
        typeof leg['flightNumber'] !== 'string' ||
        !Number.isInteger(leg['distanceNm'])
      ) throw new Error('Invalid landing showcase leg');
    }
  }
  return raw as LandingShowcaseCatalog;
}

export function useLandingData(baseUrlOverride?: string): LandingLoadState {
  const [state, setState] = useState<LandingLoadState>({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const rawBase = baseUrlOverride ?? import.meta.env.BASE_URL ?? '/';
    const baseUrl = rawBase.replace(/\/$/, '');

    void (async () => {
      try {
        const response = await fetch(`${baseUrl}/data/site/landing-showcases.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = parseLandingCatalog(await response.json());
        if (!cancelled) setState({ status: 'ready', data, error: null });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrlOverride]);

  return state;
}
