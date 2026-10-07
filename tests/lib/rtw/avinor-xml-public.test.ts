import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { parseAvinorXmlPublicSnapshot } from '../../../src/lib/schemas/avinor-xml-public.ts';
import { parseAirportCatalog } from '../../../src/lib/schemas/airports.ts';
import { CaaWeeklyScheduleTierSchema } from '../../../src/lib/schemas/caa-weekly-schedule-tier.ts';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';
import { buildRouteEntityProfile } from '../../../src/lib/rtw/route-library-entities.ts';
import { avinorOslDepartureDate, routeFlightNumberFreshness } from '../../../src/lib/rtw/time-bound-flight-numbers.ts';

const base = 'public/data/route-network';
const snapshot = parseAvinorXmlPublicSnapshot(JSON.parse(readFileSync(`${base}/avinor-osl-public-20261006.json`, 'utf8')));
const xml = readFileSync(`${base}/avinor-osl-public-20261006.xml`);
const runtime = parseRouteNetworkCatalog(JSON.parse(readFileSync(`${base}/runtime-current.json`, 'utf8')));
const caa = CaaWeeklyScheduleTierSchema.parse(JSON.parse(readFileSync(`${base}/caa-weekly-schedule-tier-20261006.json`, 'utf8')));
const airports = new Map(parseAirportCatalog(JSON.parse(readFileSync('public/data/airports.json', 'utf8'))).map(row => [row.iata, row] as const));

describe('Avinor XML Public release', () => {
  test('pins the original response bytes and exact accepted OSL associations', () => {
    expect(xml.byteLength).toBe(849_172);
    expect(createHash('sha256').update(xml).digest('hex')).toBe('78403435f3c31ae82d9b45249267cf5e843a7db76bf81bd1f39bb856a65adf7f');
    expect(snapshot.snapshot.acceptedAssociationsSHA256).toBe('a3fa00d80894a65a09baf1d7a8dc845e654b0a43200424e4ab50b3194a8468b8');
    expect(snapshot.snapshot.attributionText).toBe('Flight data from Avinor');
    expect(snapshot.snapshot.attributionURL).toBe('https://www.avinor.no/');
    expect(snapshot.snapshot.termsURL).toBe('https://partner.avinor.no/en/services/flight-data/');
    expect(snapshot.associations).toHaveLength(412);
    const candidateKeys = snapshot.associations.map(row => row.candidateKey);
    expect(new Set(candidateKeys).size).toBe(412);
    expect(new Set(candidateKeys.map(key => key.split('|')[3])).size).toBe(412);
    expect(new Set(candidateKeys.map(key => {
      const [carrier, , pair] = key.split('|');
      return `${carrier}|${pair}`;
    })).size).toBe(130);
  });

  test('keeps the actual CAA schedule reference tier disjoint by exact key', () => {
    const caaKeys = new Set(caa.associations.map(row => row.key));
    expect(snapshot.associations.filter(row => caaKeys.has(row.candidateKey))).toHaveLength(0);
    expect(caa.associationCount).toBe(488);
  });

  test('keeps upcoming occurrences date-bound and expires the source exactly at its UTC cutoff', () => {
    const first = snapshot.associations[0]!;
    const [, , pair, number] = first.candidateKey.split('|');
    const [from, to] = pair!.split('>');
    const route = runtime.routes.find(row => row.carrier === first.candidateKey.split('|')[0]
      && row.pair[0] === from && row.pair[1] === to
      && row.timeBoundFlightNumbers?.some(item => item.flightNumber === number));
    expect(route).toBeDefined();
    const sourceById = new Map(runtime.sources.map(source => [source.id, source] as const));
    const cutoff = Date.parse(snapshot.snapshot.validUntilUTC);
    const evidence = route!.timeBoundFlightNumbers!.find(item => item.flightNumber === number)!;
    const firstOccurrence = Math.min(...evidence.occurrencesUTC.map(value => Date.parse(value)));
    const lastOccurrence = Math.max(...evidence.occurrencesUTC.map(value => Date.parse(value)));
    expect(firstOccurrence).toBeLessThan(cutoff);
    expect(lastOccurrence).toBeLessThan(cutoff);
    expect(routeFlightNumberFreshness(route!, sourceById, firstOccurrence - 1).current).toContain(number);
    const passed = routeFlightNumberFreshness(route!, sourceById, lastOccurrence + 1);
    expect(passed.current).not.toContain(number);
    expect(passed.passed).toContain(number);
    expect(passed.candidates).toContain(number);
    const staleAt = routeFlightNumberFreshness(route!, sourceById, cutoff);
    const staleAfter = routeFlightNumberFreshness(route!, sourceById, cutoff + 1);
    for (const stale of [staleAt, staleAfter]) {
      expect(stale.current).not.toContain(number);
      expect(stale.stale).toContain(number);
      expect(stale.candidates).toContain(number);
    }
    expect(avinorOslDepartureDate('2026-10-06T22:30:00Z')).toBe('2026-10-07');
  });

  test('keeps expired Avinor rows as dated history and demotes their number after expiry', () => {
    const first = snapshot.associations[0]!;
    const [carrier, , pair, flightNumber] = first.candidateKey.split('|');
    const [from, to] = pair!.split('>');
    const build = (evidenceNow: number) => buildRouteEntityProfile({
      network: runtime,
      airports,
      carrierNames: new Map([[carrier!, carrier!]]),
      memberCodes: new Set([carrier!]),
      evidenceNow,
    }, `${from}-${to}`);
    const carrierProfileAt = (evidenceNow: number) => {
      const profile = build(evidenceNow);
      if (!profile) throw new Error(`Missing route profile for ${from}-${to}`);
      const row = profile.route.carriers.find(candidate => candidate.carrier === carrier);
      if (!row) throw new Error(`Missing carrier profile for ${carrier}`);
      return row;
    };
    const current = carrierProfileAt(Date.parse(snapshot.snapshot.retrievedAtUTC));
    expect(current.identity).toBe('provider-listed');
    expect(current.confirmedNumbers).not.toContain(flightNumber);
    expect(current.datedFlightNumbers.find(row => row.flightNumber === flightNumber)?.freshUntilUTC).toBe(snapshot.snapshot.validUntilUTC);
    expect(current.datedFlightNumbers.find(row => row.flightNumber === flightNumber)?.occurrencesUTC.length).toBeGreaterThan(0);

    const expired = carrierProfileAt(Date.parse(snapshot.snapshot.validUntilUTC));
    expect(expired.datedFlightNumbers.find(row => row.flightNumber === flightNumber)?.occurrencesUTC.length).toBeGreaterThan(0);
    expect(expired.staleNumbers).toContain(flightNumber);
    expect(expired.candidateNumbers).toContain(flightNumber);
  });
});
