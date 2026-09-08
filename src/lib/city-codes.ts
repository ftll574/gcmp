/**
 * IATA metropolitan area codes — pseudo-codes that map to a set of airports
 * serving a single city. Used by autocomplete to surface "did you mean
 * JFK / LGA / EWR" disambiguation when the user types a city code.
 *
 * These codes are real IATA assignments (the "Metropolitan Area Codes")
 * — they don't correspond to a single airport.
 *
 *   resolveCityCode('NYC') → ['JFK', 'LGA', 'EWR']
 *   resolveCityCode('SFO') → null  (SFO is a real airport, not a city)
 */

import type { Iata } from './types.ts';

const CITY_CODES: Record<string, ReadonlyArray<Iata>> = {
  NYC: ['JFK', 'LGA', 'EWR'],
  TYO: ['HND', 'NRT'],
  LON: ['LHR', 'LGW', 'STN', 'LCY', 'LTN', 'SEN'],
  PAR: ['CDG', 'ORY', 'BVA', 'LBG'],
  WAS: ['IAD', 'DCA', 'BWI'],
  CHI: ['ORD', 'MDW'],
  MOW: ['SVO', 'DME', 'VKO'],
  BJS: ['PEK', 'PKX'],
  SHA: ['PVG', 'SHA'],
  SEL: ['ICN', 'GMP'],
  OSA: ['KIX', 'ITM', 'UKB'],
  YTO: ['YYZ', 'YTZ', 'YHM'],
  YMQ: ['YUL', 'YHU'],
  MIL: ['MXP', 'LIN', 'BGY'],
  STO: ['ARN', 'BMA', 'NYO', 'VST'],
  IEV: ['KBP', 'IEV'],
  TCI: ['TFN', 'TFS'],
  BUE: ['EZE', 'AEP'],
  RIO: ['GIG', 'SDU'],
  SAO: ['GRU', 'CGH', 'VCP'],
  BHX: ['BHX'],
};

const CITY_CODE_LABELS: Readonly<Record<string, string>> = {
  NYC: 'New York', TYO: 'Tokyo', LON: 'London', PAR: 'Paris', WAS: 'Washington',
  CHI: 'Chicago', MOW: 'Moscow', BJS: 'Beijing', SHA: 'Shanghai', SEL: 'Seoul',
  OSA: 'Osaka', YTO: 'Toronto', YMQ: 'Montreal', MIL: 'Milan', STO: 'Stockholm',
  IEV: 'Kyiv', TCI: 'Tenerife', BUE: 'Buenos Aires', RIO: 'Rio de Janeiro',
  SAO: 'São Paulo', BHX: 'Birmingham',
  TPE: 'Taipei',
};

// Some metropolitan identifiers overlap a physical airport code. Keep these
// OUT of CITY_CODES so typing the physical airport (e.g. TPE) still selects
// that airport directly, while reverse metro logic can group airport changes.
const REVERSE_ONLY_METRO_GROUPS: Readonly<Record<string, ReadonlyArray<Iata>>> = {
  TPE: ['TPE', 'TSA'],
};

const AIRPORT_TO_CITY_CODE: Readonly<Record<Iata, string>> = Object.freeze(
  Object.fromEntries(
    [...Object.entries(CITY_CODES), ...Object.entries(REVERSE_ONLY_METRO_GROUPS)].flatMap(([cityCode, airports]) =>
      airports.map((iata) => [iata, cityCode] as const)),
  ),
);

export function resolveCityCode(code: string): ReadonlyArray<Iata> | null {
  const c = code.toUpperCase();
  return CITY_CODES[c] ?? null;
}

export function isCityCode(code: string): boolean {
  return resolveCityCode(code) !== null;
}

/** Metropolitan-area code containing this physical airport, when curated. */
export function cityCodeForAirport(iata: Iata): string | null {
  return AIRPORT_TO_CITY_CODE[iata.toUpperCase()] ?? null;
}

/** Physical airports in the same curated IATA metropolitan area. */
export function metropolitanAirportsFor(iata: Iata): ReadonlyArray<Iata> {
  const cityCode = cityCodeForAirport(iata);
  return cityCode ? (CITY_CODES[cityCode] ?? REVERSE_ONLY_METRO_GROUPS[cityCode] ?? []) : [];
}

/** Human-readable metropolitan label used by route validation/UI. */
export function cityCodeLabel(code: string): string | null {
  return CITY_CODE_LABELS[code.toUpperCase()] ?? null;
}

/** All city codes (e.g. ['NYC', 'TYO', 'LON', ...]). */
export const CITY_CODE_LIST: ReadonlyArray<string> = Object.keys(CITY_CODES);
