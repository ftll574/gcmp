import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseRouteNetworkCatalog } from '../../src/lib/schemas/route-network.ts';
import { SiroRegisteredPlanReleaseSchema } from '../../src/lib/schemas/siros-registered-plan-release.ts';
import { buildSiroRegisteredPlanOverlay } from '../../scripts/lib/siros-registered-plan-input.ts';

const ROOT = 'public/data/route-network';
const airports = new Set((JSON.parse(readFileSync('public/data/airports.json', 'utf8')) as Array<{ iata: string }>).map((row) => row.iata));
const release = SiroRegisteredPlanReleaseSchema.parse(JSON.parse(readFileSync(`${ROOT}/siros-registered-plan-release-20261007.json`, 'utf8')));
const proposalBytes = readFileSync(`${ROOT}/siros-registered-plan-proposal-20261007.jsonl.gz`);
const rawRowsBytes = readFileSync(`${ROOT}/siros-registered-plan-raw-rows-20261007.jsonl.gz`);
const overlay = buildSiroRegisteredPlanOverlay(proposalBytes, rawRowsBytes);
const runtime = parseRouteNetworkCatalog(JSON.parse(readFileSync(`${ROOT}/runtime-current.json`, 'utf8')), airports);
const runtimeMeta = JSON.parse(readFileSync(`${ROOT}/runtime-current.meta.json`, 'utf8')) as {
  registeredScheduleEvidence: {
    acceptedSourceRows: number;
    existingRouteKeysEnriched: number;
    registeredPlanProfilesAdded: number;
    registeredPlanProfilesMatchedAndLineaged: number;
    totalRegisteredPlanProfilesAfterMerge: number;
    storedFlightDesignatorRouteAssociations: number;
    eligibleDatedDepartureAssociationsAtCapture: number;
    eligibleDatedDepartureOccurrencesAtCapture: number;
    routeEntriesAdded: number;
    flightNumbersPromoted: number;
    timeBoundFlightNumbersPromoted: number;
  };
};

it('pins the independently reviewed source, proposal, rights and accepted raw-row snapshot', () => {
  expect(overlay.artifacts.proposal).toEqual(release.inputs.proposal);
  expect(overlay.artifacts.acceptedRawRows).toEqual(release.inputs.acceptedRawRows);
  expect(overlay.source.contentSHA256).toBe(release.source.bodySHA256);
  expect(overlay.source.retrievedAtUTC).toBe(release.source.retrievedAtUTC);
  expect(overlay.counts).toMatchObject({
    acceptedSourceRows: 14997,
    associationGroups: 1447,
    existingRouteKeys: 386,
    candidateRows: 276,
    candidateAssociations: 57,
    confirmedRows: 0,
    newIdentityRows: 14721,
    newIdentityAssociations: 1390,
    registeredPlanIdentityMatchRows: 2592,
    sameRegistrationAndProfileRows: 2575,
  });
  expect(release.source.rightsBasis).toContain('No Creative Commons variant');
  expect(release.boundaries.join(' ')).toContain('not proof of actual operation');
});

it('keeps all 14,997 exact source rows attached to plan profiles without flight-layer promotion', () => {
  const sourceId = 'anac-siros-registrations-20261007';
  const enrichedRoutes = runtime.routes.filter((route) => (route.registeredPlans ?? []).some((plan) =>
    (plan.sourceRowLineage ?? []).some((row) => row.sourceId === sourceId)));
  const lineage = enrichedRoutes.flatMap((route) => (route.registeredPlans ?? []).flatMap((plan) =>
    (plan.sourceRowLineage ?? []).filter((row) => row.sourceId === sourceId)));
  expect(enrichedRoutes).toHaveLength(386);
  expect(lineage).toHaveLength(14997);
  expect(new Set(lineage.map((row) => `${row.sourceId}:${row.sourceRow}`)).size).toBe(14997);
  expect(runtimeMeta.registeredScheduleEvidence).toEqual(expect.objectContaining({
    acceptedSourceRows: 14997,
    existingRouteKeysEnriched: 386,
    registeredPlanProfilesAdded: 12422,
    registeredPlanProfilesMatchedAndLineaged: 2575,
    totalRegisteredPlanProfilesAfterMerge: 15304,
    storedFlightDesignatorRouteAssociations: 2767,
    eligibleDatedDepartureAssociationsAtCapture: 1104,
    eligibleDatedDepartureOccurrencesAtCapture: 3581,
    routeEntriesAdded: 0,
    flightNumbersPromoted: 0,
    timeBoundFlightNumbersPromoted: 0,
  }));
  for (const route of runtime.routes) {
    expect(route.flightNumberSourceIds ?? []).not.toContain(sourceId);
    expect(route.flightNumberCandidateSourceIds ?? []).not.toContain(sourceId);
    expect(route.timeBoundFlightNumbers ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId }),
    ]));
  }
});

it('preserves the qualified ACN identity on existing route-only directions', () => {
  const acn = runtime.routes.filter((route) => route.carrier === '2F' && route.carrierEntityKey === 'BR+ACN+azul-conecta-ltda');
  expect(acn).toHaveLength(4);
  expect(acn.every((route) => route.routeEvidenceScope === 'route-only')).toBe(true);
  expect(acn.every((route) => !route.flightNumbers && !route.flightNumberCandidates && !route.timeBoundFlightNumbers)).toBe(true);
  const plans = acn.flatMap((route) => route.registeredPlans ?? []).filter((plan) =>
    (plan.sourceRowLineage ?? []).some((row) => row.sourceId === 'anac-siros-registrations-20261007'));
  expect(plans.length).toBeGreaterThan(0);
  expect(plans.every((plan) => plan.registeredOperator === '2F' && plan.registeredOperatorICAO === 'ACN'
    && plan.carrierEntityKey === 'BR+ACN+azul-conecta-ltda')).toBe(true);
  expect(plans.every((plan) => typeof plan.flightNumberRaw === 'string' && /^\d{1,4}$/.test(plan.flightNumberRaw))).toBe(true);
});
