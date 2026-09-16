/**
 * Schedule-vs-operated drift report — bounded POC (2026-09-16).
 *
 * Compares scheduled departure/arrival clocks for BR (EVA) TPE-endpoint
 * services against flown (ADS-B) observations where available.
 *
 * This is the P2 operational-validation benchmark from
 * docs/flight-data-source-strategy-2026-09-11.md — a quality measurement,
 * NOT a schedule source and NOT a replacement for the future schedule feed.
 *
 * Trust rules (unchanged):
 *  - A missing observation is reported as `no-observation`, never as
 *    "no flight" or "on time".
 *  - Drift is only computed when an observation exists for the exact
 *    route+flightNumber+date.
 *  - No weekday inference, no future-date claim, no award-seat claim.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OFFICIAL_SCHEDULES = 'public/data/official-schedules.json';
const FLOWN_REGISTRY = 'public/data/route-network/adsb-flown-confirmed-br-20260916.json';

interface OfficialService {
  carrier: string;
  flightNumber: string;
  from: string;
  to: string;
  date: string;
  departureTime?: string;
  arrivalTime?: string;
  arrivalDayOffset?: number;
  sourceId: string;
}

interface FlownEntry {
  flightNumber: string;
  from: string;
  to: string;
  date: string;
  departureUtc?: string;
  arrivalUtc?: string;
  observedAt?: string;
  note: string;
}

function minutesFromClock(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function driftMinutes(scheduled: string, flown: string): number {
  const scheduledMinutes = minutesFromClock(scheduled);
  const flownMinutes = minutesFromClock(flown);
  return flownMinutes - scheduledMinutes;
}

export function buildDriftReport(
  services: OfficialService[],
  flownEntries: FlownEntry[],
): unknown {
  const flownByKey = new Map<string, FlownEntry>();
  for (const entry of flownEntries) {
    flownByKey.set(`${entry.from}-${entry.to}-${entry.flightNumber}-${entry.date}`, entry);
  }
  const rows = [];
  for (const service of services) {
    if (service.carrier !== 'BR') continue;
    const flown = flownByKey.get(`${service.from}-${service.to}-${service.flightNumber}-${service.date}`);
    const designator = `${service.carrier}${service.flightNumber}`;
    rows.push({
      flightNumber: designator,
      from: service.from,
      to: service.to,
      date: service.date,
      scheduledDeparture: service.departureTime ?? null,
      scheduledArrival: service.arrivalTime ?? null,
      departureDriftMinutes: flown?.departureUtc ? driftMinutes(service.departureTime ?? '00:00', flown.departureUtc) : null,
      arrivalDriftMinutes: flown?.arrivalUtc ? driftMinutes(service.arrivalTime ?? '00:00', flown.arrivalUtc) : null,
      status: flown ? (flown.departureUtc && flown.arrivalUtc ? 'observed' : 'partial-observation') : 'no-observation',
      observationNote: flown?.note ?? 'No flown observation in checked-in ADS-B snapshot (2026-07-01..09-09).',
    });
  }
  const observed = rows.filter((row) => row.status === 'observed');
  const noObservation = rows.filter((row) => row.status === 'no-observation');
  return {
    version: 1,
    generatedOn: '2026-09-16',
    purpose: 'P2 operational validation — schedule-vs-operated drift benchmark for BR TPE-endpoint services.',
    scope: 'BR (EVA) services in public/data/official-schedules.json. Quality benchmark only; not a schedule source.',
    summary: {
      services: rows.length,
      observed: observed.length,
      partialObservation: rows.filter((row) => row.status === 'partial-observation').length,
      noObservation: noObservation.length,
      meanDepartureDriftMinutes: observed.length
        ? Number((observed.reduce((sum, row) => sum + (row.departureDriftMinutes ?? 0), 0) / observed.length).toFixed(1))
        : null,
      meanArrivalDriftMinutes: observed.length
        ? Number((observed.reduce((sum, row) => sum + (row.arrivalDriftMinutes ?? 0), 0) / observed.length).toFixed(1))
        : null,
    },
    trustNote: 'Missing observations are reported as no-observation, never as "no flight" or "on time". Drift is only computed for exact route+flightNumber+date matches.',
    rows,
  };
}

export function main(): void {
  const schedulesRaw = JSON.parse(readFileSync(OFFICIAL_SCHEDULES, 'utf8')) as {
    services: OfficialService[];
  };
  const registry = JSON.parse(readFileSync(FLOWN_REGISTRY, 'utf8')) as {
    flownObservations: { entries: FlownEntry[] };
  };
  const report = buildDriftReport(schedulesRaw.services, registry.flownObservations.entries);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
