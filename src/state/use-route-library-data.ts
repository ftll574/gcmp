import { useEffect, useState } from 'react';
import { parseAirportCatalog } from '../lib/schemas/airports.ts';
import { AllianceCatalogSchema, type AllianceCatalog } from '../lib/schemas/alliance.ts';
import {
  CountryContinentCatalogSchema,
  type ContinentId,
} from '../lib/schemas/country-continent.ts';
import type { Airport } from '../lib/types.ts';
import { parseRuntimeRouteNetworkMeta, type RuntimeRouteNetworkMeta } from '../lib/route-network-runtime.ts';

export interface RouteLibraryData {
  readonly airports: ReadonlyArray<Airport>;
  readonly allianceCatalog: AllianceCatalog;
  readonly countryContinents: ReadonlyMap<string, ContinentId> | null;
  readonly countrySubregions: ReadonlyMap<string, string> | null;
  readonly airportContinentOverrides: ReadonlyMap<string, ContinentId> | null;
  readonly routeNetworkRuntimeUrl: string;
  /** Public Route Library supplies this build hash for the fast runtime path.
   * Legacy/standalone callers may omit it and fall back to canonical Zod. */
  readonly routeNetworkRuntimeMeta?: RuntimeRouteNetworkMeta;
}

export type RouteLibraryLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: RouteLibraryData }
  | { readonly status: 'error'; readonly error: string };

async function fetchJsonStrict(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch ${url} failed: HTTP ${response.status}`);
  return (await response.json()) as unknown;
}

async function fetchJsonOptional(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export function useRouteLibraryData(baseUrlOverride?: string): RouteLibraryLoadState {
  const [state, setState] = useState<RouteLibraryLoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const rawBase = baseUrlOverride ?? import.meta.env.BASE_URL ?? '/';
    const baseUrl = rawBase.replace(/\/$/, '');

    async function load(): Promise<void> {
      try {
        const [airportsRaw, allianceRaw, geoRaw, routeNetworkMetaRaw] = await Promise.all([
          fetchJsonStrict(`${baseUrl}/data/airports.json`),
          fetchJsonStrict(`${baseUrl}/data/alliances/current.json`),
          fetchJsonOptional(`${baseUrl}/data/geo/current.json`),
          fetchJsonStrict(`${baseUrl}/data/route-network/runtime-current.meta.json`),
        ]);
        if (cancelled) return;

        const airports = parseAirportCatalog(airportsRaw);
        const allianceCatalog = AllianceCatalogSchema.parse(allianceRaw);
        const routeNetworkRuntimeMeta = parseRuntimeRouteNetworkMeta(routeNetworkMetaRaw);
        let countryContinents: ReadonlyMap<string, ContinentId> | null = null;
        let countrySubregions: ReadonlyMap<string, string> | null = null;
        let airportContinentOverrides: ReadonlyMap<string, ContinentId> | null = null;

        if (geoRaw !== null && geoRaw !== undefined) {
          try {
            const geoCatalog = CountryContinentCatalogSchema.parse(geoRaw);
            countryContinents = new Map(
              geoCatalog.mappings.map((row) => [row.country, row.continent] as const),
            );
            countrySubregions = new Map(
              geoCatalog.mappings
                .filter((row) => row.subregion !== undefined)
                .map((row) => [row.country, row.subregion as string] as const),
            );
            airportContinentOverrides = new Map(
              geoCatalog.airportOverrides.map((row) => [row.iata, row.continent] as const),
            );
          } catch (error) {
            console.warn('geo/current.json schema parse failed; route-library region metadata disabled:', error);
          }
        }

        setState({
          status: 'ready',
          data: {
            airports,
            allianceCatalog,
            countryContinents,
            countrySubregions,
            airportContinentOverrides,
            routeNetworkRuntimeUrl: `${baseUrl}/data/route-network/runtime-current.json`,
            routeNetworkRuntimeMeta,
          },
        });
      } catch (error) {
        if (cancelled) return;
        setState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [baseUrlOverride]);

  return state;
}
