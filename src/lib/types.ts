/**
 * Shared types across the engine and UI. UI imports these freely; engine
 * (lib/calc/**) does not depend on UI types.
 */

export type Iata = string; // 3-letter airport code, uppercase
export type AirlineIata = string; // 2-3 letter airline code, uppercase

export interface Airport {
  readonly iata: Iata;
  readonly icao?: string;
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

export type ProgramId = 'aa-aadvantage' | 'as-mileage-plan';

/** Short program code used in URL query (`?p=AA,AS`). */
export type ProgramShortCode = 'AA' | 'AS';

export const PROGRAM_SHORT_CODES: Record<ProgramShortCode, ProgramId> = {
  AA: 'aa-aadvantage',
  AS: 'as-mileage-plan',
};

export const PROGRAM_LABELS: Record<ProgramId, string> = {
  'aa-aadvantage': 'AA AAdvantage',
  'as-mileage-plan': 'Alaska Mileage Plan',
};

export interface Leg {
  readonly from: Iata;
  readonly to: Iata;
  readonly operatingCarrier: AirlineIata;
}

export interface RoutingRequest {
  readonly legs: ReadonlyArray<Leg>;
  readonly cabin: CabinId;
  readonly programs: ReadonlyArray<ProgramId>;
  /** Rules version. Undefined means "use the current rules version". */
  readonly rulesVersion?: string;
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
  readonly pqm: number;
  readonly rdm: number;
  readonly byLeg: ReadonlyArray<LegEarning>;
  readonly notes: ReadonlyArray<string>;
}

export interface RoutingResult {
  readonly totalDistanceNm: number;
  readonly byLeg: ReadonlyArray<LegDistance>;
  readonly programs: Record<ProgramId, ProgramEarning>;
  /** Warning notes that apply globally (e.g. polar route distortion). */
  readonly warnings: ReadonlyArray<string>;
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
