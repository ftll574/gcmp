/**
 * Shared types across the engine and UI. UI imports these freely; engine
 * (lib/calc/**) does not depend on UI types.
 */

export type Iata = string; // 3-letter airport code, uppercase
export type AirlineIata = string; // 2-3 letter airline code, uppercase

export interface Airport {
  readonly iata: Iata;
  /**
   * `| undefined` (vs bare optional) mirrors zod's optional-field inference
   * so schema-parsed rows stay assignable under exactOptionalPropertyTypes.
   */
  readonly icao?: string | undefined;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly lat: number;
  readonly lon: number;
}

export interface Airline {
  readonly iata: AirlineIata;
  readonly icao?: string;
  readonly name: string;
  readonly country: string;
}

export type CabinId = 'economy' | 'premium-economy' | 'business' | 'first';

/**
 * Generalized elite tier. Each program names its tiers differently (UA
 * Silver/Gold/Plat/1K, AA Gold/Plat/Plat Pro/Exec Plat, BA Bronze/Silver/
 * Gold, etc.). Mapping every variant to a global enum keeps the UI
 * compact; the trade-off is that the bonus % is an approximation.
 *
 *   none → 0% bonus on RDM
 *   mid  → +25%  (Silver-ish across most programs)
 *   high → +50%  (Gold-ish)
 *   top  → +100% (Platinum / 1K / Diamond)
 *
 * Status Miles (PQM) are NEVER bonused — defeats the purpose of status
 * progression math, and no program actually bonuses qualifying miles.
 */
export type EliteTier = 'none' | 'mid' | 'high' | 'top';

export const ELITE_TIER_BONUS: Record<EliteTier, number> = {
  none: 0,
  mid: 0.25,
  high: 0.5,
  top: 1.0,
};

/**
 * Loyalty-program identifier. String-typed (not a literal union) so adding
 * a new program is a JSON file drop, not a type-system rewrite. The runtime
 * source of truth is `PROGRAM_REGISTRY` below — its keys are the canonical
 * set of program IDs the app knows about.
 */
export type ProgramId = string;

/** Short program code used in URL query (`?p=AA,UA,DL`). 2-3 chars. */
export type ProgramShortCode = string;

/** Loyalty alliance — used by the picker to group programs. */
export type Alliance = 'oneworld' | 'star' | 'skyteam' | 'none';

export interface ProgramRegistryEntry {
  readonly id: ProgramId;
  readonly shortCode: ProgramShortCode;
  readonly label: string;
  readonly alliance: Alliance;
}

/**
 * Source of truth for which loyalty programs the app knows about.
 * Adding a new program: add an entry here AND drop a JSON file at
 * `public/data/programs/{shortCodeLower}/v{YYYY.Q}.json` + `current.json`.
 */
export const PROGRAM_REGISTRY: ReadonlyArray<ProgramRegistryEntry> = [
  // Oneworld
  { id: 'aa-aadvantage', shortCode: 'AA', label: 'AA AAdvantage', alliance: 'oneworld' },
  { id: 'ba-executive-club', shortCode: 'BA', label: 'BA Executive Club', alliance: 'oneworld' },
  { id: 'cx-asia-miles', shortCode: 'CX', label: 'Cathay Asia Miles', alliance: 'oneworld' },
  { id: 'jl-mileage-bank', shortCode: 'JL', label: 'JAL Mileage Bank', alliance: 'oneworld' },
  { id: 'mh-enrich', shortCode: 'MH', label: 'Malaysia Enrich', alliance: 'oneworld' },
  // Star Alliance
  { id: 'ua-mileageplus', shortCode: 'UA', label: 'United MileagePlus', alliance: 'star' },
  { id: 'ac-aeroplan', shortCode: 'AC', label: 'Air Canada Aeroplan', alliance: 'star' },
  { id: 'sq-krisflyer', shortCode: 'SQ', label: 'Singapore KrisFlyer', alliance: 'star' },
  { id: 'nh-mileage-club', shortCode: 'NH', label: 'ANA Mileage Club', alliance: 'star' },
  { id: 'br-infinity', shortCode: 'BR', label: 'EVA Infinity', alliance: 'star' },
  { id: 'tg-royal-orchid', shortCode: 'TG', label: 'Thai Royal Orchid Plus', alliance: 'star' },
  // SkyTeam
  { id: 'dl-skymiles', shortCode: 'DL', label: 'Delta SkyMiles', alliance: 'skyteam' },
  { id: 'af-flying-blue', shortCode: 'AF', label: 'AF/KL Flying Blue', alliance: 'skyteam' },
  { id: 'ci-dynasty-flyer', shortCode: 'CI', label: 'CI Dynasty Flyer', alliance: 'skyteam' },
  { id: 'mu-eastern-miles', shortCode: 'MU', label: 'MU Eastern Miles', alliance: 'skyteam' },
  { id: 'ke-skypass', shortCode: 'KE', label: 'KE SkyPass', alliance: 'skyteam' },
  // No alliance
  { id: 'as-mileage-plan', shortCode: 'AS', label: 'Alaska Mileage Plan', alliance: 'none' },
  { id: 'ek-skywards', shortCode: 'EK', label: 'Emirates Skywards', alliance: 'none' },
];

export const PROGRAM_SHORT_CODES: Readonly<Record<ProgramShortCode, ProgramId>> = Object.freeze(
  Object.fromEntries(PROGRAM_REGISTRY.map((p) => [p.shortCode, p.id])),
);

export const PROGRAM_SHORT_BY_ID: Readonly<Record<ProgramId, ProgramShortCode>> = Object.freeze(
  Object.fromEntries(PROGRAM_REGISTRY.map((p) => [p.id, p.shortCode])),
);

export const PROGRAM_LABELS: Readonly<Record<ProgramId, string>> = Object.freeze(
  Object.fromEntries(PROGRAM_REGISTRY.map((p) => [p.id, p.label])),
);

export const PROGRAM_ALLIANCES: Readonly<Record<ProgramId, Alliance>> = Object.freeze(
  Object.fromEntries(PROGRAM_REGISTRY.map((p) => [p.id, p.alliance])),
);

/**
 * Single-letter fare class / booking class (e.g. "J", "C", "D", "Y", "I").
 * Earning multipliers are keyed by this letter inside `carrier.fareBuckets`.
 * Optional on Leg — when absent, the engine falls back to the carrier's
 * `defaultLetterByCabin[globalCabin]`. Asian booking-class buckets matter:
 * CX I=25% vs J=150% on the same partner credit; SQ V vs T; BA K vs N.
 */
export type FareClass = string;

export interface Leg {
  readonly from: Iata;
  readonly to: Iata;
  readonly operatingCarrier: AirlineIata;
  /** Optional per-leg fare class letter override. */
  readonly fareClass?: FareClass;
  /**
   * Optional per-leg CABIN actually booked (economy / premium-economy /
   * business / first). Distinct from `fareClass` (booking-class letter).
   * Mixed-cabin RTW pricing prices the whole itinerary at the highest
   * booked cabin ("highest class wins"); undefined falls back to the
   * routing's global cabin.
   */
  readonly cabin?: CabinId;
  /**
   * RTW planning metadata. Stopovers are stays of 24h+ at the arrival point;
   * transfers are shorter connections. Undefined means "unknown" so the RTW
   * validator can avoid pretending it knows timing before the user enters it.
   */
  readonly stopover?: boolean;
  /**
   * Surface/open-jaw sector: user travels from `from` to `to` without a flight.
   * Distance may still count for some award products, but it is not a flight
   * coupon and has no operating carrier eligibility.
   */
  readonly surface?: boolean;
  /**
   * Optional per-leg departure date, ISO `YYYY-MM-DD`. Absent = undated
   * (the leg carries no timing claim; chronology/day checks skip it).
   * Shared via the URL `d=` parameter, which mirrors `op`'s group/leg shape
   * (docs/decisions/flight-schedule-model.md S1).
   */
  readonly departsOn?: string;
}

export type ProjectionShortCode = 'm' | 'e' | 'a' | 'o';

/**
 * A single contiguous routing within a multi-group request. gcmap renders
 * each group as a separate color on one map (e.g. "compare SFO-NRT vs SFO-HKG").
 */
export interface RoutingGroup {
  readonly legs: ReadonlyArray<Leg>;
}

export interface RoutingRequest {
  /**
   * Groups of legs. v1 had a single `legs[]` at the top — v0.4 promoted this
   * to `groups[]` to support gcmap-style multi-routing comparisons. Single-
   * group URLs from v0.1–v0.3 still parse (1-element groups array).
   */
  readonly groups: ReadonlyArray<RoutingGroup>;
  readonly cabin: CabinId;
  readonly programs: ReadonlyArray<ProgramId>;
  /** Rules version. Undefined means "use the current rules version". */
  readonly rulesVersion?: string;
  /** Map projection preference. Undefined → default (mercator). */
  readonly projection?: import('./calc/projections.ts').ProjectionId;
  /** RTW trip start date, ISO YYYY-MM-DD. Optional until user sets dates. */
  readonly startDate?: string;
  /** RTW trip final arrival date, ISO YYYY-MM-DD. Optional until user sets dates. */
  readonly endDate?: string;
  /** Selected RTW fare/award product id. Optional for backwards-compatible URLs. */
  readonly rtwProductId?: string;
  /**
   * Elite tier for RDM bonusing. Undefined → 'none'. Applies a single
   * generalized bonus % across all selected programs.
   */
  readonly tier?: EliteTier;
}

export interface LegDistance {
  readonly leg: Leg;
  readonly distanceNm: number;
}

export interface LegEarning {
  readonly pqm: number;
  readonly rdm: number;
  readonly distanceNm: number;
  readonly notes: ReadonlyArray<string>;
  /** True when no rule was found for (carrier, cabin). */
  readonly missingRule: boolean;
}

export interface ProgramEarning {
  readonly programId: ProgramId;
  readonly label: string;
  readonly alliance?: string;
  readonly confidence: 'chart-verified' | 'community-corrected' | 'mixed';
  /** Status Miles total. NEVER bonused by elite tier. */
  readonly pqm: number;
  /** Award Miles total. INCLUDES elite-tier bonus if applicable. */
  readonly rdm: number;
  /** Award Miles WITHOUT the elite-tier bonus, for split rendering. */
  readonly rdmBase: number;
  /** Elite-tier bonus applied (e.g. 0.5 for high tier). Zero when none. */
  readonly tierBonus: number;
  readonly byLeg: ReadonlyArray<LegEarning>;
  readonly notes: ReadonlyArray<string>;
  /** Rules version used to compute this earning (e.g. "2026.4"). */
  readonly rulesVersion: string;
  /** ISO date the rules were last verified against the airline's chart. */
  readonly lastVerified: string;
  /** Source URL for audit — typically the airline's partner-earning chart. */
  readonly sourceUrl: string;
  /**
   * True when this program actually uses revenue-based earning (UA PQP,
   * AA Loyalty Points, DL MQDs). Our distance-multiplier number is a
   * cabin-bucket approximation — shown as "estimate" in the UI.
   */
  readonly revenueBased: boolean;
}

/** Per-group computed result. */
export interface GroupResult {
  readonly totalDistanceNm: number;
  readonly byLeg: ReadonlyArray<LegDistance>;
  readonly programs: Record<ProgramId, ProgramEarning>;
  readonly warnings: ReadonlyArray<string>;
}

export interface RoutingResult {
  /** Per-group breakdown. Length matches RoutingRequest.groups. */
  readonly groups: ReadonlyArray<GroupResult>;
  /** Sum of all groups' totalDistanceNm. */
  readonly grandTotalDistanceNm: number;
  /** Sum of per-program totals across all groups. */
  readonly grandTotals: Record<ProgramId, { pqm: number; rdm: number }>;
  /** Rules version actually used (current, or the historic snapshot). */
  readonly rulesVersionUsed: string;
}

export type UrlParseErrorKind =
  | 'wrong-schema-version'
  | 'malformed-path'
  | 'unknown-program'
  | 'unknown-cabin'
  | 'unknown-airport'
  | 'mismatched-op-length'
  | 'missing-required-param';

export interface UrlParseError {
  readonly ok: false;
  readonly kind: UrlParseErrorKind;
  readonly message: string;
}

export interface UrlParseOk {
  readonly ok: true;
  readonly request: RoutingRequest;
}

export type UrlParseResult = UrlParseOk | UrlParseError;
