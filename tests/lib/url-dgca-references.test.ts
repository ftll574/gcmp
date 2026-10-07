import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  DgcaScheduleDraftReferenceSchema,
  DgcaScheduleEvidenceCatalogSchema,
} from '../../src/lib/schemas/dgca-schedule-evidence.ts';
import { encodeShareUrl, parseShareUrl } from '../../src/lib/url-schema.ts';
import { isFlightLeg, type FlightLeg, type RoutingRequest } from '../../src/lib/types.ts';

const catalog = DgcaScheduleEvidenceCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/dgca-schedule-evidence-20261007.json', 'utf8')),
);
const source = catalog.sources.find(item => item.id === 'dgca-indigo-domestic-ss-2026')!;
const identity = source.references.find(item => item.id === 'dgca-indigo-6e102-bom-del')!;
const reference = DgcaScheduleDraftReferenceSchema.parse({
  source: {
    id: source.id, title: source.title, url: source.url, pdfSha256: source.pdfSha256,
    pdfBytes: source.pdfBytes, pages: source.pages,
    publishedDateRaw: source.publishedDateRaw, checkedAt: source.checkedAt, reviewBy: source.reviewBy,
    reviewedSnapshotDate: source.reviewedSnapshotDate, attribution: source.attribution,
    reusePolicyUrl: source.reusePolicyUrl, reusePolicyStatement: source.reusePolicyStatement,
    operator: source.operator,
  },
  reference: identity,
  catalogSnapshotAsOfDate: catalog.snapshotAsOfDate,
});

const request: RoutingRequest = {
  groups: [{ legs: [{
    from: 'BOM', to: 'DEL', departsOn: '2026-10-07', stopover: true, dgcaScheduleReference: reference,
  }] }],
  cabin: 'economy' as const,
  programs: ['aa-aadvantage' as const],
};

function asFlightLeg(leg: RoutingRequest['groups'][number]['legs'][number] | undefined): FlightLeg {
  if (!leg || !isFlightLeg(leg)) throw new Error('Expected a flight leg');
  return leg;
}

test('round-trips unresolved DGCA identity, route, date, raw fields, source links, row lineage and conflicts', () => {
  const encoded = encodeShareUrl(request);
  expect(encoded).toContain('op=');
  expect(encoded).toContain('&dg=');
  expect(encoded).not.toContain('fn=');
  const parsed = parseShareUrl(encoded);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const leg = asFlightLeg(parsed.request.groups[0]?.legs[0]);
  expect(leg).toMatchObject({ from: 'BOM', to: 'DEL', departsOn: '2026-10-07', stopover: true });
  expect(leg?.operatingCarrier).toBeUndefined();
  expect(leg?.flightNumber).toBeUndefined();
  expect(leg?.dgcaScheduleReference).toEqual(reference);
  expect(parseShareUrl(encodeShareUrl(parsed.request))).toMatchObject({ ok: true, request: parsed.request });
  expect(encoded.length).toBeLessThan(16_000);
});

test('date edits outside the effective window survive share/load without losing the qualification', () => {
  const leg = request.groups[0]!.legs[0]!;
  const edited = { ...request, groups: [{ legs: [{ ...leg, departsOn: '2027-01-01' }] }] };
  const parsed = parseShareUrl(encodeShareUrl(edited));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(asFlightLeg(parsed.request.groups[0]?.legs[0])).toMatchObject({ departsOn: '2027-01-01', dgcaScheduleReference: reference });
  expect(asFlightLeg(parsed.request.groups[0]?.legs[0]).operatingCarrier).toBeUndefined();
});

test('a traveler-selected carrier remains an assumption alongside the independent source snapshot', () => {
  const leg = request.groups[0]!.legs[0]!;
  const selected = { ...request, groups: [{ legs: [{ ...leg, operatingCarrier: '6E', carrierAssumed: true }] }] };
  const parsed = parseShareUrl(encodeShareUrl(selected));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.request.groups[0]?.legs[0]).toMatchObject({
    operatingCarrier: '6E', carrierAssumed: true, dgcaScheduleReference: reference,
  });
});

test('rejects malformed DGCA source snapshots and references attached to a different direction', () => {
  const encoded = encodeShareUrl(request);
  const corrupted = encoded.replace(/([?&]dg=)[^&]*/, '$1not-a-source-snapshot');
  expect(parseShareUrl(corrupted)).toMatchObject({ ok: false, kind: 'malformed-path' });
  const wrongDirection = {
    ...request,
    groups: [{ legs: [{ ...request.groups[0]!.legs[0]!, from: 'DEL', to: 'BOM' }] }],
  };
  expect(parseShareUrl(encodeShareUrl(wrongDirection))).toMatchObject({ ok: false, kind: 'malformed-path' });
});
