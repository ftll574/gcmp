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
import { AwardPricingCatalogSchema, type AwardPricingCatalog } from '../lib/schemas/award-pricing.ts';
import { AllianceCatalogSchema, type AllianceCatalog } from '../lib/schemas/alliance.ts';
import { MarketProfileSchema, type MarketProfile } from '../lib/schemas/market.ts';
import { ProgramSchema, type Program } from '../lib/schemas/program.ts';
import { RtwRuleCatalogSchema, type RtwRuleCatalog } from '../lib/schemas/rtw-rule.ts';
import { ValuationsSchema, type Valuations } from '../lib/schemas/valuations.ts';
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
  /** Per-program ¢/mile redemption-value chip. Null if file unavailable. */
  valuations: Valuations | null;
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
          valuationsRaw,
          allianceRaw,
          rtwRulesRaw,
          awardPricingRaw,
          marketRaw,
          ...programRaws
        ] = await Promise.all([
          fetchJsonStrict(`${baseUrl}/data/airports.json`),
          fetchJsonStrict(`${baseUrl}/data/airlines.json`),
          fetchJsonOptional(`${baseUrl}/data/valuations/current.json`),
          fetchJsonStrict(`${baseUrl}/data/alliances/current.json`),
          fetchJsonStrict(`${baseUrl}/data/rtw-products/current.json`),
          fetchJsonStrict(`${baseUrl}/data/award-pricing/current.json`),
          fetchJsonStrict(`${baseUrl}/data/markets/tw/current.json`),
          ...programDirs.map((dir) =>
            fetchJsonOptional(`${baseUrl}/data/programs/${dir}/current.json`),
          ),
        ]);
        if (cancelled) return;

        let valuations: Valuations | null = null;
        if (valuationsRaw !== null && valuationsRaw !== undefined) {
          try {
            valuations = ValuationsSchema.parse(valuationsRaw);
          } catch (e) {
            console.warn('Valuations schema parse failed; redemption-value chip will be hidden:', e);
          }
        }

        if (!Array.isArray(airportsRaw)) throw new Error('airports.json malformed');
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

        if (programs.size === 0) {
          throw new Error('No loyalty programs loaded successfully.');
        }

        setState({
          status: 'ready',
          data: {
            airports: airportsRaw as Airport[],
            airlines: airlinesRaw as Airline[],
            programs,
            allianceCatalog,
            rtwRuleCatalog,
            awardPricingCatalog,
            marketProfile,
            valuations,
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
