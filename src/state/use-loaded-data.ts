/**
 * Loads the static datasets at app startup: airports, airlines, and both
 * loyalty programs (AA + AS). All fetched in parallel from /data/*.json.
 *
 *   Returns { status: 'loading' | 'ready' | 'error', data?, error? }
 *
 * Programs are validated via zod inside loadProgram (program-loader.ts).
 */

import { useEffect, useState } from 'react';
import { ProgramSchema, type Program } from '../lib/schemas/program.ts';
import type { Airline, Airport, ProgramId } from '../lib/types.ts';

export interface LoadedData {
  airports: ReadonlyArray<Airport>;
  airlines: ReadonlyArray<Airline>;
  programs: ReadonlyMap<ProgramId, Program>;
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

export function useLoadedData(baseUrlOverride?: string): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // Vite injects BASE_URL — '/' on local dev + Cloudflare; '/gcmp/' on GitHub Pages.
    const rawBase = baseUrlOverride ?? import.meta.env.BASE_URL ?? '/';
    const baseUrl = rawBase.replace(/\/$/, ''); // strip trailing slash; '' for root.
    async function load(): Promise<void> {
      try {
        const [airportsRaw, airlinesRaw, aaRaw, asRaw] = await Promise.all([
          fetchJsonStrict(`${baseUrl}/data/airports.json`),
          fetchJsonStrict(`${baseUrl}/data/airlines.json`),
          fetchJsonStrict(`${baseUrl}/data/programs/aa/current.json`),
          fetchJsonStrict(`${baseUrl}/data/programs/as/current.json`),
        ]);
        if (cancelled) return;

        if (!Array.isArray(airportsRaw)) throw new Error('airports.json malformed');
        if (!Array.isArray(airlinesRaw)) throw new Error('airlines.json malformed');

        const programs = new Map<ProgramId, Program>();
        programs.set('aa-aadvantage', ProgramSchema.parse(aaRaw));
        programs.set('as-mileage-plan', ProgramSchema.parse(asRaw));

        setState({
          status: 'ready',
          data: {
            airports: airportsRaw as Airport[],
            airlines: airlinesRaw as Airline[],
            programs,
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
