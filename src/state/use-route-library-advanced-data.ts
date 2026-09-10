import { useCallback, useEffect, useState } from 'react';
import { AirportBrowseRegionCatalogSchema } from '../lib/schemas/airport-browse-region.ts';
import { parseScheduleCatalog, type ScheduleEntry } from '../lib/schemas/flight-schedules.ts';
import {
  OfficialScheduleCatalogSchema,
  type OfficialScheduleCatalog,
} from '../lib/schemas/published-schedules.ts';

export interface RouteLibraryAdvancedData {
  readonly schedules: ReadonlyArray<ScheduleEntry> | null;
  readonly officialSchedules: OfficialScheduleCatalog;
  readonly airportBrowseRegions: ReadonlyMap<string, string> | null;
}

export type RouteLibraryAdvancedLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: RouteLibraryAdvancedData }
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

export function useRouteLibraryAdvancedData(baseUrlOverride?: string): {
  readonly state: RouteLibraryAdvancedLoadState;
  readonly retry: () => void;
} {
  const [state, setState] = useState<RouteLibraryAdvancedLoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const rawBase = baseUrlOverride ?? import.meta.env.BASE_URL ?? '/';
    const baseUrl = rawBase.replace(/\/$/, '');

    async function load(): Promise<void> {
      try {
        const [schedulesRaw, officialSchedulesRaw, airportBrowseRegionsRaw] = await Promise.all([
          fetchJsonOptional(`${baseUrl}/data/schedules/current.json`),
          fetchJsonStrict(`${baseUrl}/data/official-schedules.json`),
          fetchJsonOptional(`${baseUrl}/data/geo/airport-browse-regions.json`),
        ]);
        if (cancelled) return;

        let schedules: ReadonlyArray<ScheduleEntry> | null = null;
        if (schedulesRaw !== null && schedulesRaw !== undefined) {
          try {
            schedules = parseScheduleCatalog(schedulesRaw).entries;
          } catch (error) {
            console.warn('schedules/current.json schema parse failed; route-library weekly schedules disabled:', error);
          }
        }

        let airportBrowseRegions: ReadonlyMap<string, string> | null = null;
        if (airportBrowseRegionsRaw !== null && airportBrowseRegionsRaw !== undefined) {
          try {
            const catalog = AirportBrowseRegionCatalogSchema.parse(airportBrowseRegionsRaw);
            airportBrowseRegions = new Map(catalog.airports.map((row) => [row.iata, row.region] as const));
          } catch (error) {
            console.warn('geo/airport-browse-regions.json invalid; route-library local-region filter disabled:', error);
          }
        }

        setState({
          status: 'ready',
          data: {
            schedules,
            officialSchedules: OfficialScheduleCatalogSchema.parse(officialSchedulesRaw),
            airportBrowseRegions,
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
  }, [attempt, baseUrlOverride]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);
  return { state, retry };
}
