import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { caaScheduleDateState, parseCaaWeeklyScheduleTier } from '../../../src/lib/schemas/caa-weekly-schedule-tier.ts';
import { parseAvinorFollowOnLedgerJsonl } from '../../../src/lib/schemas/avinor-follow-on.ts';
import { parseAvinorRemainingAirportsLedgerJsonl } from '../../../src/lib/schemas/avinor-remaining-airports.ts';

const tier = parseCaaWeeklyScheduleTier(JSON.parse(readFileSync('public/data/route-network/caa-weekly-schedule-tier-20261006.json', 'utf8')));
const runtime = JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')) as {
  routes: Array<{
    carrier: string;
    carrierEntityKey?: string;
    pair: [string, string];
    flightNumbers?: string[];
    flightNumberCandidates?: string[];
    timeBoundFlightNumbers?: Array<{ flightNumber: string }>;
  }>;
};
const followOnRows = parseAvinorFollowOnLedgerJsonl(readFileSync('public/data/route-network/avinor-follow-on-evidence-20261006.jsonl', 'utf8'));
const followOnNetNewKeys = new Set(followOnRows.filter(row => !row.runtimeBaseline.exactIdentityWasCandidateBeforeHandoff).map(row => row.candidateKey));
const remainingKeys = new Set(parseAvinorRemainingAirportsLedgerJsonl(readFileSync('public/data/route-network/avinor-remaining-airports-accepted-20261007.jsonl', 'utf8')).map(row => row.candidateKey));
const candidateKeys = new Set(runtime.routes.flatMap(route => {
  const [from, to] = route.pair;
  const entity = route.carrierEntityKey ?? route.carrier;
  const candidateDesignators = [
    ...(route.flightNumberCandidates ?? []),
    ...(route.timeBoundFlightNumbers ?? []).map(row => row.flightNumber)
      .filter(designator => {
        const key = `${route.carrier}|${entity}|${from}>${to}|${designator}`;
        return !followOnNetNewKeys.has(key) && !remainingKeys.has(key);
      }),
  ];
  return candidateDesignators.map(designator => `${entity}|${route.carrier}|${from}>${to}|${designator}`);
}));
const candidateKeySetSha256 = createHash('sha256')
  .update([...candidateKeys].sort().map(key => `${key}\n`).join(''))
  .digest('hex');

describe('CAA weekly schedule reference tier', () => {
  test('keeps a disjoint 488-association schedule tier separate from the 839 operator-confirmed associations', () => {
    const scheduleKeys = new Set(tier.associations.map(row => row.key));
    const confirmedKeys = new Set<string>();
    const confirmedDesignators = new Set<string>();
    const confirmedRoutes = new Set<string>();
    for (const route of runtime.routes) {
      const entity = route.carrierEntityKey ?? route.carrier;
      const [from, to] = route.pair;
      const timeBound = new Set((route.timeBoundFlightNumbers ?? []).map(row => row.flightNumber));
      for (const designator of route.flightNumbers ?? []) {
        if (timeBound.has(designator)) continue;
        confirmedKeys.add(`${entity}|${route.carrier}|${from}>${to}|${designator}`);
        confirmedDesignators.add(designator);
        confirmedRoutes.add(`${entity}|${route.carrier}|${from}>${to}`);
      }
    }
    expect(scheduleKeys.size).toBe(488);
    expect(new Set(tier.associations.map(row => row.flightDesignator)).size).toBe(483);
    expect(new Set(tier.associations.map(row => `${row.carrier}|${row.from}>${row.to}`)).size).toBe(253);
    expect(confirmedKeys.size).toBe(839);
    expect(confirmedDesignators.size).toBe(829);
    expect(confirmedRoutes.size).toBe(295);
    expect(candidateKeys.size).toBe(132_996);
    expect(candidateKeySetSha256).toBe(tier.candidateAssociationKeysSha256);
    expect([...scheduleKeys].filter(key => confirmedKeys.has(key))).toEqual([]);
    expect([...scheduleKeys].every(key => candidateKeys.has(key))).toBe(true);
    expect(tier.operatorIdentity).toBe('unknown');
    expect(tier.associations.every(row => row.operatingCarrier === null && !row.actualOperationConfirmed
      && row.bookability === 'unknown' && !row.selectableOperatingService)).toBe(true);
  });

  test('preserves direction, weekly days, source validity and explicit time-zone uncertainty', () => {
    const outbound = tier.associations.find(row => row.key === '5J|5J|KHH>MNL|5J345')!;
    const inbound = tier.associations.find(row => row.key === '5J|5J|MNL>KHH|5J344')!;
    expect(outbound.from).toBe('KHH');
    expect(outbound.to).toBe('MNL');
    expect(inbound.from).toBe('MNL');
    expect(inbound.to).toBe('KHH');
    expect(outbound.weeklyWindows[0]).toMatchObject({
      weekdaysISO: [1, 3, 5, 6, 7],
      validity: { from: '2026-10-06', until: '2026-10-18' },
      departureTimeRaw: '2000',
      departureTimeDisplay: '20:00',
      timezone: 'not-defined-by-source',
      nonstopConfirmed: false,
    });
    expect(caaScheduleDateState(outbound, '2026-10-06')).toBe('not-listed-weekday');
    expect(caaScheduleDateState(outbound, '2026-10-07')).toBe('listed');
    expect(caaScheduleDateState(outbound, '2026-10-21')).toBe('listed');
    expect(caaScheduleDateState(outbound, '2026-10-25')).toBe('outside-published-window');
    expect(caaScheduleDateState(outbound, 'not-a-date')).toBe('invalid-date');
  });

  test('rejects accidental promotion to operating service or bookable flight', () => {
    const raw = JSON.parse(readFileSync('public/data/route-network/caa-weekly-schedule-tier-20261006.json', 'utf8')) as {
      associations: Array<Record<string, unknown>>;
    };
    raw.associations[0] = { ...raw.associations[0], selectableOperatingService: true };
    expect(() => parseCaaWeeklyScheduleTier(raw)).toThrow();
  });
});
