/**
 * Loads the static datasets at app startup: airports, airlines, and every
 * loyalty program in PROGRAM_REGISTRY. All fetched in parallel from
 * `/data/*.json`.
 *
 *   Returns { status: 'loading' | 'ready' | 'error', data?, error? }
 *
 * Programs are validated via zod (ProgramSchema). A program whose JSON is
 * missing or malformed is logged and skipped — the rest still load.
 */

import { useEffect, useState } from 'react';
import { parseAirportCatalog } from '../lib/schemas/airports.ts';
import { AwardPricingCatalogSchema, type AwardPricingCatalog } from '../lib/schemas/award-pricing.ts';
import { AllianceCatalogSchema, type AllianceCatalog } from '../lib/schemas/alliance.ts';
import {
  CountryContinentCatalogSchema,
  type ContinentId,
} from '../lib/schemas/country-continent.ts';
import { parseCiZoneMap, type CiZoneMap } from '../lib/schemas/ci-zones.ts';
import {
  parseScheduleCatalog,
  type ScheduleEntry,
} from '../lib/schemas/flight-schedules.ts';
import { MarketProfileSchema, type MarketProfile } from '../lib/schemas/market.ts';
import {
  parseNetworkGapCatalog,
  type NetworkGapEntry,
} from '../lib/schemas/network-gaps.ts';
import { ProgramSchema, type Program } from '../lib/schemas/program.ts';
import { RtwRuleCatalogSchema, type RtwRuleCatalog } from '../lib/schemas/rtw-rule.ts';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import {
  PROGRAM_REGISTRY,
  type Airline,
  type Airport,
  type ProgramId,
} from '../lib/types.ts';

export interface LoadedData {
  airports: ReadonlyArray<Airport>;
  airlines: ReadonlyArray<Airline>;
  programs: ReadonlyMap<ProgramId, Program>;
  allianceCatalog: AllianceCatalog;
  rtwRuleCatalog: RtwRuleCatalog;
  awardPricingCatalog: AwardPricingCatalog;
  marketProfile: MarketProfile;
  /**
   * Country→continent base map for `summary.continentsVisited`.
   * Null if the geo file is unavailable/malformed — the engine then
   * degrades to an empty continents list (degrade-to-null contract).
   */
  countryContinents: ReadonlyMap<string, ContinentId> | null;
  /**
   * Country→subregion second tier for the destinations explorer
   * (geo `.mappings[].subregion`, optional per row). Null alongside
   * `countryContinents`; countries without a row hang directly under
   * their continent.
   */
  countrySubregions: ReadonlyMap<string, string> | null;
  /**
   * Airport-level continent overrides (geo `.airportOverrides`, keyed by
   * IATA). Null alongside `countryContinents` — applied by the engine
   * before the country row (spec §8 Q5).
   */
  airportContinentOverrides: ReadonlyMap<string, ContinentId> | null;
  /**
   * Carrier network-gap watchlist entries (network-gaps/current.json).
   * Null if the file is unavailable/malformed — the engine then emits no
   * network-gap warnings (degrade-to-null contract).
   */
  networkGaps: ReadonlyArray<NetworkGapEntry> | null;
  /**
   * Curated directional flight schedules (schedules/current.json). Null
   * if the file is unavailable/malformed — the engine then emits no
   * schedule-day warnings and the UI keeps date pickers fully enabled
   * (same degrade-to-null contract as `networkGaps`).
   */
  schedules: ReadonlyArray<ScheduleEntry> | null;
  /** Published route observations, never a substitute for dated schedules. */
  routeNetwork: RouteNetworkCatalog | null;
  /** Build-time global route counts used by the plan gate without loading the
   * multi-megabyte runtime graph. Null if runtime metadata is unavailable. */
  routeNetworkCounts: ReadonlyMap<string, number> | null;
  /** Full premerged graph is fetched only when the user explicitly expands
   * the all-routes disclosure. */
  routeNetworkRuntimeUrl: string;
  /** Planner discovery fetches only the first-letter shard for its active
   * origin instead of downloading the complete global graph. */
  routeNetworkOriginShardBaseUrl: string;
  /**
   * CI SkyTeAm partner-award station→zone map (geo/ci-zones.json). Null if
   * the file is unavailable/malformed — the panel then shows no per-leg
   * zone quotes (degrade-to-null, same contract as `networkGaps`).
   */
  ciZones: CiZoneMap | null;
}

export type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: LoadedData }
  | { status: 'error'; error: string };

async function fetchJsonStrict(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fetch ${url} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as unknown;
}

async function fetchJsonOptional(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

function parseRouteNetworkCounts(raw: unknown): ReadonlyMap<string, number> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const counts = (raw as { routeCountByCarrier?: unknown }).routeCountByCarrier;
  if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) return null;
  const result = new Map<string, number>();
  for (const [carrier, value] of Object.entries(counts)) {
    if (!/^[A-Z0-9]{2,3}$/.test(carrier) || !Number.isInteger(value) || (value as number) < 0) return null;
    result.set(carrier, value as number);
  }
  return result.size > 0 ? result : null;
}

export function useLoadedData(baseUrlOverride?: string): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const rawBase = baseUrlOverride ?? import.meta.env.BASE_URL ?? '/';
    const baseUrl = rawBase.replace(/\/$/, '');

    async function load(): Promise<void> {
      try {
        const programDirs = PROGRAM_REGISTRY.map((p) => p.shortCode.toLowerCase());
        const [
          airportsRaw,
          airlinesRaw,
          allianceRaw,
          rtwRulesRaw,
          awardPricingRaw,
          marketRaw,
          geoRaw,
          networkGapsRaw,
          schedulesRaw,
          ciZonesRaw,
          routeNetworkRaw,
          runtimeRouteNetworkMetaRaw,
          ...programRaws
        ] = await Promise.all([
          fetchJsonStrict(`${baseUrl}/data/airports.json`),
          fetchJsonStrict(`${baseUrl}/data/airlines.json`),
          fetchJsonStrict(`${baseUrl}/data/alliances/current.json`),
          fetchJsonStrict(`${baseUrl}/data/rtw-products/current.json`),
          fetchJsonStrict(`${baseUrl}/data/award-pricing/current.json`),
          fetchJsonStrict(`${baseUrl}/data/markets/tw/current.json`),
          fetchJsonOptional(`${baseUrl}/data/geo/current.json`),
          fetchJsonOptional(`${baseUrl}/data/network-gaps/current.json`),
          fetchJsonOptional(`${baseUrl}/data/schedules/current.json`),
          fetchJsonOptional(`${baseUrl}/data/geo/ci-zones.json`),
          fetchJsonOptional(`${baseUrl}/data/route-network/current.json`),
          fetchJsonOptional(`${baseUrl}/data/route-network/runtime-current.meta.json`),
          ...programDirs.map((dir) =>
            fetchJsonOptional(`${baseUrl}/data/programs/${dir}/current.json`),
          ),
        ]);
        if (cancelled) return;

        const airports = parseAirportCatalog(airportsRaw);
        let routeNetwork: RouteNetworkCatalog | null = null;
        if (routeNetworkRaw !== null && routeNetworkRaw !== undefined) {
          try {
            const knownAirports = new Set(airports.map((airport) => airport.iata));
            routeNetwork = parseRouteNetworkCatalog(routeNetworkRaw, knownAirports);
          } catch (e) {
            console.warn('route-network/current.json invalid; using schedule-only discovery:', e);
          }
        }
        let routeNetworkCounts: ReadonlyMap<string, number> | null = null;
        if (routeNetwork !== null && runtimeRouteNetworkMetaRaw !== null && runtimeRouteNetworkMetaRaw !== undefined) {
          routeNetworkCounts = parseRouteNetworkCounts(runtimeRouteNetworkMetaRaw);
          if (routeNetworkCounts === null) {
            console.warn('route-network/runtime-current.meta.json invalid; plan gate uses curated route counts.');
          }
        }

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
              geoCatalog.airportOverrides.map((o) => [o.iata, o.continent] as const),
            );
          } catch (e) {
            console.warn('geo/current.json schema parse failed; continentsVisited will be empty:', e);
          }
        }

        let networkGaps: ReadonlyArray<NetworkGapEntry> | null = null;
        if (networkGapsRaw !== null && networkGapsRaw !== undefined) {
          try {
            networkGaps = parseNetworkGapCatalog(networkGapsRaw).gaps;
          } catch (e) {
            console.warn(
              'network-gaps/current.json schema parse failed; network-gap warnings disabled:',
              e,
            );
          }
        }

        let schedules: ReadonlyArray<ScheduleEntry> | null = null;
        if (schedulesRaw !== null && schedulesRaw !== undefined) {
          try {
            schedules = parseScheduleCatalog(schedulesRaw).entries;
          } catch (e) {
            console.warn(
              'schedules/current.json schema parse failed; schedule warnings and calendar day-disabling disabled:',
              e,
            );
          }
        }

        let ciZones: CiZoneMap | null = null;
        if (ciZonesRaw !== null && ciZonesRaw !== undefined) {
          try {
            ciZones = parseCiZoneMap(ciZonesRaw);
          } catch (e) {
            console.warn(
              'geo/ci-zones.json schema parse failed; CI per-leg zone quotes disabled:',
              e,
            );
          }
        }

        if (!Array.isArray(airlinesRaw)) throw new Error('airlines.json malformed');
        const allianceCatalog = AllianceCatalogSchema.parse(allianceRaw);
        const rtwRuleCatalog = RtwRuleCatalogSchema.parse(rtwRulesRaw);
        const awardPricingCatalog = AwardPricingCatalogSchema.parse(awardPricingRaw);
        const marketProfile = MarketProfileSchema.parse(marketRaw);

        const programs = new Map<ProgramId, Program>();
        PROGRAM_REGISTRY.forEach((entry, i) => {
          const raw = programRaws[i];
          if (raw === null || raw === undefined) {
            console.warn(`Program data missing for ${entry.id} — skipping`);
            return;
          }
          try {
            const parsed = ProgramSchema.parse(raw);
            programs.set(entry.id, parsed);
          } catch (e) {
            console.error(`Program ${entry.id} schema parse failed:`, e);
          }
        });

        // Earning programs are legacy, optional inputs to secondary tools.
        // Their absence must never block the independent RTW planner.
        setState({
          status: 'ready',
          data: {
            airports,
            airlines: airlinesRaw as Airline[],
            programs,
            allianceCatalog,
            rtwRuleCatalog,
            awardPricingCatalog,
            marketProfile,
            countryContinents,
            countrySubregions,
            airportContinentOverrides,
            networkGaps,
            schedules,
            routeNetwork,
            routeNetworkCounts,
            routeNetworkRuntimeUrl: `${baseUrl}/data/route-network/runtime-current.json`,
            routeNetworkOriginShardBaseUrl: `${baseUrl}/data/route-network/runtime-origins`,
            ciZones,
          },
        });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setState({ status: 'error', error: message });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [baseUrlOverride]);

  return state;
}
