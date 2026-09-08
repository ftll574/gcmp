import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { CX_INITIAL_OPERATOR_EVIDENCE_CHECKED_AT, findKnownOtherOperator, findOperatorEvidence, LATEST_OPERATOR_EVIDENCE_CHECKED_AT, OPERATOR_EVIDENCE_CHECKED_AT } from '../../server/operator-evidence.ts';
import { normalizeTdxSchedules } from '../../server/tdx-schedules.ts';
import { flightDayView } from '../../src/lib/rtw/dated-flight-status.ts';

const NOW = Date.parse('2026-09-05T17:09:57Z');
const AFTER_REVIEW = Date.parse(OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
const weekdays = { Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: true };
function row(AirlineID: string, FlightNumber: string, from: string, to: string) {
  return { AirlineID, FlightNumber, DepartureAirportID: from, ArrivalAirportID: to,
    ScheduleStartDate: '2026-09-01', ScheduleEndDate: '2026-10-24', DepartureTime: '10:00', ArrivalTime: '12:00',
    ...weekdays, CodeShare: [], UpdateTime: new Date(NOW).toISOString() };
}

test.each([
  ['TPE', 'HKG', 'BR', '809'], ['TPE', 'HKG', 'BR', '851'], ['TPE', 'HKG', 'BR', '857'],
  ['TPE', 'HKG', 'BR', '867'], ['TPE', 'HKG', 'BR', '869'], ['TPE', 'HKG', 'BR', '871'], ['TPE', 'HKG', 'BR', '891'],
  ['HKG', 'TPE', 'BR', '810'], ['HKG', 'TPE', 'BR', '852'], ['HKG', 'TPE', 'BR', '858'],
  ['HKG', 'TPE', 'BR', '868'], ['HKG', 'TPE', 'BR', '870'], ['HKG', 'TPE', 'BR', '872'], ['HKG', 'TPE', 'BR', '892'],
  ['TPE', 'SFO', 'BR', '8'], ['TPE', 'SFO', 'BR', '18'],
])('exact official operator evidence exists only for %s-%s %s%s', (from, to, carrier, number) => {
  expect(findOperatorEvidence(from, to, carrier, number, '2026-09-07', AFTER_REVIEW)).toMatchObject({
    name: 'EVA Air official flight status', kind: 'airline-publication',
  });
});

test.each([
  ['TPE', 'HKG', 'BR', '2891'], ['TPE', 'HKG', 'BR', '2899'],
  ['TPE', 'SFO', 'AS', '7218'], ['TPE', 'HKG', 'CX', '443'],
])('prefix, route presence, or plausible designator never substitutes for evidence: %s-%s %s%s', (from, to, carrier, number) => {
  expect(findOperatorEvidence(from, to, carrier, number, '2026-09-07', AFTER_REVIEW)).toBeNull();
});

test('chart-verified BR28 filing is date-aware operator evidence', () => {
  expect(findOperatorEvidence('TPE', 'SFO', 'BR', '28', '2026-09-07', AFTER_REVIEW)).toMatchObject({
    name: 'Chart-verified airline schedule filing', kind: 'industry-timetable',
  });
});

test.each([
  ['TPE', 'HKG', 'JX', '233'], ['HKG', 'TPE', 'JX', '234'], ['TPE', 'SFO', 'JX', '12'],
])('STARLUX official timetable promotes exact identity only inside its captured window: %s-%s %s%s', (from, to, carrier, number) => {
  expect(findOperatorEvidence(from, to, carrier, number, '2026-09-12', AFTER_REVIEW)).toMatchObject({
    name: 'STARLUX official timetable API', kind: 'airline-publication',
  });
  expect(findOperatorEvidence(from, to, carrier, number, '2026-09-07', AFTER_REVIEW)).toBeNull();
  expect(findOperatorEvidence(from, to, carrier, number, '2026-09-16', AFTER_REVIEW)).toBeNull();
});

test.each([
  ['TPE', 'HKG', '407'], ['TPE', 'HKG', '421'], ['TPE', 'HKG', '443'], ['TPE', 'HKG', '451'], ['TPE', 'HKG', '461'],
  ['TPE', 'HKG', '469'], ['TPE', 'HKG', '473'], ['TPE', 'HKG', '477'], ['TPE', 'HKG', '479'], ['TPE', 'HKG', '489'],
  ['TPE', 'HKG', '495'], ['TPE', 'HKG', '531'], ['TPE', 'HKG', '565'],
  ['HKG', 'TPE', '400'], ['HKG', 'TPE', '402'], ['HKG', 'TPE', '408'], ['HKG', 'TPE', '420'], ['HKG', 'TPE', '422'],
  ['HKG', 'TPE', '450'], ['HKG', 'TPE', '464'], ['HKG', 'TPE', '466'], ['HKG', 'TPE', '472'], ['HKG', 'TPE', '488'],
  ['HKG', 'TPE', '494'], ['HKG', 'TPE', '530'], ['HKG', 'TPE', '564'],
])('cross-source Cathay evidence is exact and short-window only: %s-%s CX%s', (from, to, number) => {
  const cxNow = Date.parse(LATEST_OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
  expect(findOperatorEvidence(from, to, 'CX', number, '2026-09-07', cxNow)).toMatchObject({
    name: 'Cross-source CX exact schedule', kind: 'industry-timetable',
  });
  expect(findOperatorEvidence(from, to, 'CX', number, '2026-09-15', cxNow)).toBeNull();
});

test.each([
  ['TPE', 'HKG', '5111', 'UO'], ['TPE', 'HKG', '5117', 'UO'], ['HKG', 'TPE', '5110', 'UO'],
])('known Cathay marketing codeshare remains non-selectable: %s-%s CX%s → %s', (from, to, number, operator) => {
  const cxNow = Date.parse(LATEST_OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
  expect(findOperatorEvidence(from, to, 'CX', number, '2026-09-07', cxNow)).toBeNull();
  expect(findKnownOtherOperator(from, to, 'CX', number, '2026-09-07', cxNow)).toMatchObject({ carrier: operator });
  expect(findKnownOtherOperator(from, to, 'CX', number, '2026-09-15', cxNow)).toBeNull();
});

test.each([
  ['2217', '635'], ['2219', '637'], ['2221', '633'],
])('EVA marketing BR%s is identified as a Thai-operated TPE-BKK codeshare (TG%s)', (number) => {
  const now = Date.parse('2026-09-07T19:24:00Z');
  expect(findOperatorEvidence('TPE', 'BKK', 'BR', number, '2026-09-08', now)).toBeNull();
  expect(findKnownOtherOperator('TPE', 'BKK', 'BR', number, '2026-09-08', now)).toMatchObject({ carrier: 'TG' });
});

test.each(['75', '67', '211', '205', '61'])('official dated service promotes BR%s as EVA-operated on TPE-BKK', (number) => {
  const now = Date.parse('2026-09-07T19:24:00Z');
  expect(findOperatorEvidence('TPE', 'BKK', 'BR', number, '2026-09-08', now)).not.toBeNull();
  expect(findKnownOtherOperator('TPE', 'BKK', 'BR', number, '2026-09-08', now)).toBeNull();
  expect(findOperatorEvidence('TPE', 'BKK', 'BR', number, '2026-09-09', now)).toBeNull();
});

test('TDX TPE-BKK BR designators split into selectable EVA flights and non-selectable Thai codeshares', () => {
  const now = Date.parse('2026-09-07T19:24:00Z');
  const currentRow = (number: string) => ({
    ...row('BR', `BR${number}`, 'TPE', 'BKK'),
    UpdateTime: '2026-09-07T19:21:00.000Z',
  });
  const result = normalizeTdxSchedules([
    ...['75', '67', '211', '205', '61'].map(currentRow),
    ...['2217', '2219', '2221'].map(currentRow),
  ], { from: 'TPE', to: 'BKK', start: '2026-09-08', end: '2026-09-08' }, now, now);

  expect(result.days[0]?.published?.map((flight) => `${flight.carrier}${flight.flightNumber}`).sort())
    .toEqual(['BR205', 'BR211', 'BR61', 'BR67', 'BR75']);
  expect(result.days[0]?.references?.map((flight) => ({
    designator: `${flight.airlineCode}${flight.flightNumber}`,
    status: flight.operatorStatus,
    operator: flight.knownOperatingCarrier,
  })).sort((a, b) => a.designator.localeCompare(b.designator))).toEqual([
    { designator: 'BR2217', status: 'known-other-operator', operator: 'TG' },
    { designator: 'BR2219', status: 'known-other-operator', operator: 'TG' },
    { designator: 'BR2221', status: 'known-other-operator', operator: 'TG' },
  ]);
});

test('Cathay completion evidence is chronological rather than retroactively backfilled', () => {
  const initialNow = Date.parse(CX_INITIAL_OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
  const completionNow = Date.parse(LATEST_OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
  expect(findOperatorEvidence('TPE', 'HKG', 'CX', '473', '2026-09-07', initialNow)).not.toBeNull();
  expect(findOperatorEvidence('TPE', 'HKG', 'CX', '531', '2026-09-07', initialNow)).toBeNull();
  expect(findKnownOtherOperator('TPE', 'HKG', 'CX', '5111', '2026-09-07', initialNow)).toBeNull();
  expect(findOperatorEvidence('TPE', 'HKG', 'CX', '531', '2026-09-07', completionNow)).not.toBeNull();
  expect(findKnownOtherOperator('TPE', 'HKG', 'CX', '5111', '2026-09-07', completionNow)).toMatchObject({ carrier: 'UO' });
});

test('every TPE↔HKG CX designator in the saved 1,111-row snapshot is explicitly classified', () => {
  const snapshot = JSON.parse(readFileSync('tests/fixtures/tdx-live-snapshot-2026-09-06.json', 'utf8')) as {
    snapshots: Array<{ rows: Array<{ AirlineID: string; FlightNumber: string; DepartureAirportID: string; ArrivalAirportID: string }> }>;
  };
  const completionNow = Date.parse(LATEST_OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
  const identities = new Map<string, { from: string; to: string; number: string }>();
  for (const row of snapshot.snapshots.flatMap((item) => item.rows)) {
    if (row.AirlineID !== 'CX') continue;
    if (!((row.DepartureAirportID === 'TPE' && row.ArrivalAirportID === 'HKG')
      || (row.DepartureAirportID === 'HKG' && row.ArrivalAirportID === 'TPE'))) continue;
    const number = row.FlightNumber.replace(/^CX0*(?=\d)/, '');
    identities.set(`${row.DepartureAirportID}-${row.ArrivalAirportID}-${number}`, { from: row.DepartureAirportID, to: row.ArrivalAirportID, number });
  }
  const classified = [...identities.values()].map((identity) => ({
    ...identity,
    operator: Boolean(findOperatorEvidence(identity.from, identity.to, 'CX', identity.number, '2026-09-10', completionNow)),
    other: findKnownOtherOperator(identity.from, identity.to, 'CX', identity.number, '2026-09-10', completionNow)?.carrier ?? null,
  }));
  expect(classified).toHaveLength(29);
  expect(classified.filter((item) => item.operator)).toHaveLength(26);
  expect(classified.filter((item) => item.other === 'UO')).toHaveLength(3);
  expect(classified.filter((item) => !item.operator && item.other === null)).toEqual([]);
  expect(classified.filter((item) => item.operator && item.other !== null)).toEqual([]);
});

test('TDX keeps exact Cathay marketing codeshares visible but identifies the different operator', () => {
  const cxNow = Date.parse(LATEST_OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
  const result = normalizeTdxSchedules([
    row('CX', 'CX5111', 'TPE', 'HKG'), row('CX', 'CX5117', 'TPE', 'HKG'), row('CX', 'CX489', 'TPE', 'HKG'),
  ], { from: 'TPE', to: 'HKG', start: '2026-09-07', end: '2026-09-07' }, cxNow, cxNow);
  expect(result.days[0]?.published).toEqual([expect.objectContaining({ carrier: 'CX', flightNumber: '489' })]);
  expect(result.days[0]?.references).toEqual([
    expect.objectContaining({ airlineCode: 'CX', flightNumber: '5111', operatorStatus: 'known-other-operator', knownOperatingCarrier: 'UO' }),
    expect.objectContaining({ airlineCode: 'CX', flightNumber: '5117', operatorStatus: 'known-other-operator', knownOperatingCarrier: 'UO' }),
  ]);
});

test('later EVA review is not retroactive when no earlier chart evidence exists', () => {
  expect(findOperatorEvidence('TPE', 'HKG', 'BR', '851', '2026-09-07', NOW)).toBeNull();
});

test('verified BR and unresolved marketing designators coexist without hiding each other', () => {
  const result = normalizeTdxSchedules([
    row('BR', 'BR008', 'TPE', 'SFO'), row('BR', 'BR028', 'TPE', 'SFO'), row('AS', 'AS7218', 'TPE', 'SFO'),
  ], { from: 'TPE', to: 'SFO', start: '2026-09-07', end: '2026-09-07' }, NOW, AFTER_REVIEW);
  const day = result.days[0]!;
  expect(day.published).toEqual([
    expect.objectContaining({ carrier: 'BR', flightNumber: '8', operatorEvidence: expect.objectContaining({ name: 'EVA Air official flight status' }) }),
    expect.objectContaining({ carrier: 'BR', flightNumber: '28', operatorEvidence: expect.objectContaining({ name: 'Chart-verified airline schedule filing' }) }),
  ]);
  expect(day.references?.map((flight) => flight.airlineCode + flight.flightNumber)).toEqual(['AS7218']);
  expect(flightDayView(day, new Set(['BR']), AFTER_REVIEW)).toMatchObject({ status: 'published', issue: 'partial' });
  expect(flightDayView(day, new Set(['CX']), AFTER_REVIEW)).toMatchObject({ status: 'unknown', issue: 'operator-unverified' });
});

test('STARLUX official window promotes JX12 while AS7218 stays unresolved', () => {
  const result = normalizeTdxSchedules([
    row('JX', 'JX012', 'TPE', 'SFO'), row('AS', 'AS7218', 'TPE', 'SFO'),
  ], { from: 'TPE', to: 'SFO', start: '2026-09-12', end: '2026-09-12' }, NOW, AFTER_REVIEW);
  expect(result.days[0]?.published).toEqual([expect.objectContaining({
    carrier: 'JX', flightNumber: '12', operatorEvidence: expect.objectContaining({ name: 'STARLUX official timetable API' }),
  })]);
  expect(result.days[0]?.references?.map((flight) => flight.airlineCode + flight.flightNumber)).toEqual(['AS7218']);
});

test('operator evidence expiry removes the promoted positive without turning it into a negative', () => {
  const result = normalizeTdxSchedules([row('BR', 'BR008', 'TPE', 'SFO')],
    { from: 'TPE', to: 'SFO', start: '2026-09-07', end: '2026-09-07' }, NOW, AFTER_REVIEW);
  const afterOperatorReview = Date.parse('2026-10-06T00:00:00Z');
  expect(flightDayView(result.days[0], new Set(['BR']), afterOperatorReview).status).toBe('unknown');
});
