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

export function resolveCityCode(code: string): ReadonlyArray<Iata> | null {
  const c = code.toUpperCase();
  return CITY_CODES[c] ?? null;
}

export function isCityCode(code: string): boolean {
  return resolveCityCode(code) !== null;
}

/** All city codes (e.g. ['NYC', 'TYO', 'LON', ...]). */
export const CITY_CODE_LIST: ReadonlyArray<string> = Object.keys(CITY_CODES);
