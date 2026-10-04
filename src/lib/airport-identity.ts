/** Physical identity only: never changes source records, service validity or share URLs. */
export const PALM_BEACH_IDENTITY = {
  codes: ['PBI', 'DJT'],
  iataEffectiveFrom: '2026-08-18',
  nameAndIcaoEffectiveFrom: '2026-07-09',
  sourceUrl: 'https://flydjt.org/about/name-change-faqs/',
} as const;

export const MANAS_IDENTITY = {
  codes: ['FRU', 'BSZ'],
  iataEffectiveFrom: '2025-08-09',
  sourceUrl: 'https://airport.kg/en/news/15',
} as const;

interface AirportIdentity {
  readonly codes: readonly string[];
  readonly evidenceCode: string;
  readonly iataEffectiveFrom: string;
  readonly nameAndIcaoEffectiveFrom?: string;
  readonly sourceUrl: string;
}
export const AIRPORT_IDENTITIES: readonly AirportIdentity[] = [
  { ...PALM_BEACH_IDENTITY, evidenceCode: 'PBI' },
  { ...MANAS_IDENTITY, evidenceCode: 'BSZ' },
];
export function airportIdentityFor(code: string): AirportIdentity | undefined {
  return AIRPORT_IDENTITIES.find(identity => identity.codes.includes(code.toUpperCase()));
}
/** Stable physical key tied to existing evidence storage, not an era claim. */
export function airportIdentityKey(code: string): string {
  return airportIdentityFor(code)?.evidenceCode ?? code.toUpperCase();
}
export function sameAirport(a: string, b: string): boolean {
  return airportIdentityKey(a) === airportIdentityKey(b);
}
/** Undated views retain the source/input code; no era is invented. */
export function airportCodeOn(code: string, date?: string): string {
  const identity = airportIdentityFor(code);
  if (!identity || !date) return code.toUpperCase();
  return identity.codes[date >= identity.iataEffectiveFrom ? 1 : 0]!;
}
export function airportIdentityPairKey(from: string, to: string): string {
  return `${airportIdentityKey(from)}-${airportIdentityKey(to)}`;
}
/** Resolves source shard storage without moving or duplicating route rows. */
export function airportEvidenceShardLetter(code: string): string {
  return airportIdentityKey(code.slice(0, 3)).slice(0, 1);
}
export function airportIdentityLabel(code: string): string {
  const identity = airportIdentityFor(code);
  if (!identity) return '';
  return `${identity.codes.join(' / ')} · IATA ${identity.iataEffectiveFrom}${identity.nameAndIcaoEffectiveFrom ? ` · ICAO / name ${identity.nameAndIcaoEffectiveFrom}` : ''}`;
}

/** An alias is known only when this physical airport has a catalog record. */
export function isKnownAirport(code: string, knownAirports: ReadonlySet<string>): boolean {
  const upper = code.toUpperCase();
  return knownAirports.has(upper) || (airportIdentityFor(upper)?.codes.some(alias => knownAirports.has(alias)) ?? false);
}
