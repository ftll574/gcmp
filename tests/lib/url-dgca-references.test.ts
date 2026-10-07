import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  DgcaScheduleDraftReferenceSchema,
  DgcaScheduleEvidenceCatalogSchema,
} from '../../src/lib/schemas/dgca-schedule-evidence.ts';
import { AllianceCatalogSchema } from '../../src/lib/schemas/alliance.ts';
import { RtwRuleCatalogSchema } from '../../src/lib/schemas/rtw-rule.ts';
import { encodeShareUrl, parseShareUrl } from '../../src/lib/url-schema.ts';
import { validateRtwRoute } from '../../src/lib/rtw/validate.ts';
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

const airIndiaSource = catalog.sources.find(item => item.id === 'dgca-air-india-domestic-ss-2026')!;
const airIndiaIdentity = airIndiaSource.references.find(item => item.id === 'dgca-airindia-ai1701-del-bdq')!;
const airIndiaReference = DgcaScheduleDraftReferenceSchema.parse({
  source: {
    id: airIndiaSource.id, title: airIndiaSource.title, url: airIndiaSource.url, pdfSha256: airIndiaSource.pdfSha256,
    pdfBytes: airIndiaSource.pdfBytes, pages: airIndiaSource.pages,
    publishedDateRaw: airIndiaSource.publishedDateRaw, checkedAt: airIndiaSource.checkedAt, reviewBy: airIndiaSource.reviewBy,
    reviewedSnapshotDate: airIndiaSource.reviewedSnapshotDate, attribution: airIndiaSource.attribution,
    reusePolicyUrl: airIndiaSource.reusePolicyUrl, reusePolicyStatement: airIndiaSource.reusePolicyStatement,
    operator: airIndiaSource.operator,
  },
  reference: airIndiaIdentity,
  catalogSnapshotAsOfDate: catalog.snapshotAsOfDate,
});

const rtwProducts = RtwRuleCatalogSchema.parse(JSON.parse(readFileSync('public/data/rtw-products/current.json', 'utf8')));
const starAllianceProduct = rtwProducts.products.find(item => item.id === 'star-alliance-rtw-fare')!;
const airports = new Map(JSON.parse(readFileSync('public/data/airports.json', 'utf8')).map((row: { iata: string }) => [row.iata, row]));
const validationInputs = {
  airports: airports as Parameters<typeof validateRtwRoute>[2]['airports'],
  allianceCatalog: AllianceCatalogSchema.parse(JSON.parse(readFileSync('public/data/alliances/current.json', 'utf8'))),
};

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

test('a DGCA share link cannot turn mapped source attribution into confirmed alliance eligibility', () => {
  const assumedSourceLeg: FlightLeg = {
    from: 'DEL', to: 'BDQ', operatingCarrier: 'AI', dgcaScheduleReference: airIndiaReference,
  };
  const encoded = encodeShareUrl({
    ...request,
    rtwProductId: 'star-alliance-rtw-fare',
    groups: [{ legs: [assumedSourceLeg] }],
  });
  expect(encoded).toContain('&assume=1');
  expect(encoded).toContain('&dg=');

  // Simulate an older or hand-crafted URL whose `op=AI` lacks `assume=1`.
  const unqualifiedUrl = encoded.replace('&assume=1', '');
  const parsed = parseShareUrl(unqualifiedUrl);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const parsedLeg = asFlightLeg(parsed.request.groups[0]?.legs[0]);
  expect(parsedLeg).toMatchObject({ operatingCarrier: 'AI', carrierAssumed: true });
  expect(parsedLeg.dgcaScheduleReference).toEqual(airIndiaReference);

  const sharedResult = validateRtwRoute(starAllianceProduct, [parsedLeg], validationInputs);
  expect(sharedResult.findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ ruleId: 'airline-eligibility', severity: 'unknown' }),
  ]));
  expect(sharedResult.findings).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ ruleId: 'airline-eligibility', severity: 'pass' }),
  ]));
  expect(sharedResult.summary.assumedCarrierLegIndexes).toEqual([0]);

  // The validator also protects internal callers that bypass URL parsing.
  const directResult = validateRtwRoute(starAllianceProduct, [assumedSourceLeg], validationInputs);
  expect(directResult.findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ ruleId: 'airline-eligibility', severity: 'unknown' }),
  ]));

  // Ordinary confirmed flights without a DGCA identity snapshot retain their old behavior.
  const confirmedResult = validateRtwRoute(starAllianceProduct, [{ from: 'DEL', to: 'BDQ', operatingCarrier: 'AI' }], validationInputs);
  expect(confirmedResult.findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ ruleId: 'airline-eligibility', severity: 'pass' }),
  ]));
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
