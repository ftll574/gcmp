import { expect, test } from 'vitest';
import { parseMrAirspaceSnapshot } from '../../scripts/build-flight-number-layer.ts';

const validSnapshot = {
  version: 1,
  source: 'https://github.com/MrAirspace/aircraft-flight-schedules',
  license: 'ODbL-1.0',
  note: 'fixture',
  entries: [{
    carrier: 'UA', from: 'IAD', to: 'PLS', quarter: '2026Q2',
    sourceUrl: 'https://github.com/MrAirspace/aircraft-flight-schedules/releases/tag/aircraft_flight_schedules_2026_quarter2',
    flightNumbers: ['UA1817'], observations: 87, seasons: ['2026Q1', '2026Q2'],
  }],
} as const;

test('accepts attributed observed flight-number candidates without operator semantics', () => {
  expect(parseMrAirspaceSnapshot(validSnapshot)).toEqual(validSnapshot);
});

test('rejects weak, duplicate, and malformed observed designators', () => {
  expect(() => parseMrAirspaceSnapshot({
    ...validSnapshot,
    entries: [{ ...validSnapshot.entries[0], observations: 1 }],
  })).toThrow('Invalid MrAirspace route');
  expect(() => parseMrAirspaceSnapshot({
    ...validSnapshot,
    entries: [validSnapshot.entries[0], validSnapshot.entries[0]],
  })).toThrow('Duplicate MrAirspace route');
  expect(() => parseMrAirspaceSnapshot({
    ...validSnapshot,
    entries: [{ ...validSnapshot.entries[0], flightNumbers: ['DL1817'] }],
  })).toThrow('Invalid MrAirspace designator');
});
