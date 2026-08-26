import type { ScheduleEntry } from '../schemas/flight-schedules.ts';

/**
 * Route discovery over the flight-schedule catalog (convergence contract §4,
 * network-explorer item B). Answers exactly one question with catalog-backed
 * honesty: "which nonstop destinations does this carrier have KNOWN schedules
 * for?" — never a claim about the carrier's full network.
 *
 *   entries ─▶ filter(carrier, drop suspended) ─▶ dedupe dest per origin
 *           ─▶ Map<origin, DestinationOption[]>   (TPE first, then A→Z)
 *
 * Coverage is partial by design (docs/decisions/flight-schedule-model.md):
 * carriers absent from the catalog yield an EMPTY map and the UI says so —
 * a missing row must read as 「班表未收錄」, not as 「不能飛」.
 */

export interface DestinationOption {
  readonly iata: string;
  readonly confidence: 'chart-verified' | 'community-corrected';
}

/** Origins sort TPE-first (Taiwan-first market) then alphabetically. */
function originOrder(a: string, b: string): number {
  if (a === 'TPE') return -1;
  if (b === 'TPE') return 1;
  return a.localeCompare(b);
}

/**
 * Group an airline's known nonstop destinations by origin airport.
 * Suspended rows are dropped outright (network-gaps owns "route gone"
 * semantics); the same destination reached via multiple season windows or
 * confidence tiers collapses to its strongest single row.
 */
export function destinationsForCarrier(
  entries: ReadonlyArray<ScheduleEntry>,
  carrier: string,
): ReadonlyMap<string, ReadonlyArray<DestinationOption>> {
  const byOrigin = new Map<string, Map<string, DestinationOption>>();
  for (const entry of entries) {
    if (entry.carrier !== carrier) continue;
    if (entry.status === 'suspended') continue;
    const [from, to] = entry.pair;
    let destinations = byOrigin.get(from);
    if (!destinations) {
      destinations = new Map();
      byOrigin.set(from, destinations);
    }
    const existing = destinations.get(to);
    // chart-verified outranks community-corrected when both exist.
    if (
      existing === undefined ||
      (existing.confidence !== 'chart-verified' && entry.confidence === 'chart-verified')
    ) {
      destinations.set(to, { iata: to, confidence: entry.confidence });
    }
  }

  const result = new Map<string, ReadonlyArray<DestinationOption>>();
  for (const [origin, destinations] of byOrigin) {
    result.set(
      origin,
      [...destinations.values()].sort((a, b) => a.iata.localeCompare(b.iata)),
    );
  }
  return new Map([...result.entries()].sort(([a], [b]) => originOrder(a, b)));
}

/**
 * Alliance member airlines usable in the two-step picker: `member` and
 * `affiliate` statuses fly; suspended/former/connect partners do not belong
 * in an alliance RTW award's eligible pool display.
 */
export function allianceMemberCarriers(
  memberships: ReadonlyArray<{
    readonly airline: string;
    readonly airlineName: string;
    readonly status: string;
    readonly alliance: string;
  }>,
  alliance: string,
): ReadonlyArray<{ readonly code: string; readonly name: string }> {
  return memberships
    .filter((m) => m.alliance === alliance && (m.status === 'member' || m.status === 'affiliate'))
    .map((m) => ({ code: m.airline, name: m.airlineName }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/* ── Geographic tiering (contract §4, explorer C-tier request):
   continent → subregion → country → airports. Subregion is OPTIONAL per
   country; countries without one hang directly under their continent,
   and countries missing from the geo file fall into an explicit
   "unmapped" bucket so nothing silently disappears. */

export const CONTINENT_ORDER = [
  'asia',
  'oceania',
  'europe',
  'north-america',
  'south-america',
  'africa',
  'antarctica',
] as const;

export interface CountryDestinationGroup {
  readonly country: string;
  readonly destinations: ReadonlyArray<DestinationOption>;
}

export interface SubregionDestinationGroup {
  /** null = countries not covered by the optional subregion tier. */
  readonly subregion: string | null;
  readonly countries: ReadonlyArray<CountryDestinationGroup>;
}

export interface ContinentDestinationGroup {
  readonly continent: string;
  readonly subregions: ReadonlyArray<SubregionDestinationGroup>;
}

function continentRank(continent: string): number {
  const index = (CONTINENT_ORDER as ReadonlyArray<string>).indexOf(continent);
  return index === -1 ? CONTINENT_ORDER.length : index;
}

/**
 * Group one origin's destination list geographically. Lookup functions are
 * injected (React-free): `countryOf` from the airport index, continent/
 * subregion from the geo catalog maps. Destinations keep their sorted
 * order inside each country bucket.
 */
export function groupDestinationsByGeo(
  destinations: ReadonlyArray<DestinationOption>,
  countryOf: (iata: string) => string | undefined,
  continentOf: (country: string) => string | undefined,
  subregionOf: (country: string) => string | undefined,
): ReadonlyArray<ContinentDestinationGroup> {
  interface CountryBucket {
    countries: Map<string, DestinationOption[]>;
    subregions: Map<string | null, Map<string, DestinationOption[]>>;
  }
  const byContinent = new Map<string, CountryBucket>();

  for (const destination of destinations) {
    const country = countryOf(destination.iata) ?? '??';
    const continent = continentOf(country) ?? 'unmapped';
    let bucket = byContinent.get(continent);
    if (!bucket) {
      bucket = { countries: new Map(), subregions: new Map() };
      byContinent.set(continent, bucket);
    }
    const subregion = subregionOf(country) ?? null;
    let subBucket = bucket.subregions.get(subregion);
    if (!subBucket) {
      subBucket = new Map();
      bucket.subregions.set(subregion, subBucket);
    }
    const list = subBucket.get(country);
    if (list) list.push(destination);
    else subBucket.set(country, [destination]);
  }

  return [...byContinent.entries()]
    .sort(([a], [b]) => continentRank(a) - continentRank(b))
    .map(([continent, bucket]) => ({
      continent,
      subregions: [...bucket.subregions.entries()]
        .sort(([a], [b]) => {
          if (a === b) return 0;
          if (a === null) return 1; // un-tiered group last within a continent
          if (b === null) return -1;
          return a.localeCompare(b);
        })
        .map(([subregion, countries]) => ({
          subregion,
          countries: [...countries.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([country, dests]) => ({ country, destinations: dests })),
        })),
    }));
}
