import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { avinorWindowExpired, dataProgressSchema, progressIsStale } from '../../src/lib/data-progress.ts';

const publicRoot = join(process.cwd(), 'public');
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(join(publicRoot, path), 'utf8')) as T;

describe('published data status integrity', () => {
  it('matches route evidence counts and digest to the exact published runtime and airport catalog', () => {
    const status = dataProgressSchema.parse(readJson('status/data-progress.json'));
    const runtimeBytes = readFileSync(join(publicRoot, 'data/route-network/runtime-current.json'));
    const runtime = JSON.parse(runtimeBytes.toString('utf8')) as { routes: Array<{ status: string }> };
    const runtimeMeta = readJson<{ outputSha256: string }>('data/route-network/runtime-current.meta.json');
    const airports = readJson<unknown[]>('data/airports.json');
    const runtimeSha256 = createHash('sha256').update(runtimeBytes).digest('hex');
    const evidence = status.routeEvidenceStatus;

    expect(status.state).toBe('verified');
    expect(status.legacy).toEqual({ total: 31658, published: 31068 });
    expect(status.qualified).toMatchObject({ routes: 0, services: 0, endpoints: 2916 });
    expect(evidence?.state).toBe('verified');
    expect(runtimeSha256).toBe('1d6f2565df9f6be1168b88c9f27d5a2df2dc9790204eaf276ffd571b5d36f400');
    expect(runtimeSha256).toBe(runtimeMeta.outputSha256);
    expect(evidence?.runtimeSHA256).toBe(runtimeSha256);
    expect(evidence?.runtimeRoutes).toBe(runtime.routes.length);
    expect(evidence?.runtimePublishedRoutes).toBe(runtime.routes.filter(route => route.status === 'published').length);
    expect(evidence?.airports).toBe(airports.length);
    expect({ routes: runtime.routes.length, published: runtime.routes.filter(route => route.status === 'published').length, airports: airports.length })
      .toEqual({ routes: 32171, published: 31581, airports: 5355 });
  });

  it('preserves source evidence tiers and explicit limits in the validated status asset', () => {
    const status = dataProgressSchema.parse(readJson('status/data-progress.json'));
    const evidence = status.routeEvidenceStatus!;
    expect(evidence.brazil.evidenceTier).toBe('provider-listed-directed');
    expect(evidence.brazil.actualOperatingCarrierConfirmed).toBe(false);
    expect(evidence.brazil.roundTheWorldEligibilityEstablished).toBe(false);
    expect(evidence.argentina.tier).toBe('historical-aggregate');
    expect(evidence.argentina.runtimeImports).toBe(0);
    expect(evidence.nextSourceGap.networkSearchNeeded).toBe(false);
    const siros = status.reviews?.siros;
    expect(siros?.state).toBe('review');
    if (siros?.state === 'review') expect(siros.newSelectable).toBe(0);
    const skyteam = status.reviews?.sirosSkyteam;
    expect(skyteam?.state).toBe('enriched');
    if (skyteam?.state === 'enriched') {
      expect(skyteam.newCurrentDirections).toBe(0);
      expect(skyteam.newSelectable).toBe(0);
    }
    expect(status.reviews?.sirosBrazilBulk?.state).toBe('stale');
    const pal = status.reviews?.palSummerInventory;
    expect(pal?.state).toBe('reviewed');
    if (pal?.state === 'reviewed') expect(pal.admittedRoutes).toBe(0);
    const avinor = status.reviews?.avinorSemantics;
    expect(avinor?.state).toBe('reviewed');
    if (avinor?.state === 'reviewed') expect(avinor.currentAdditions).toBe(0);
    expect(status.qualified?.avinor?.confirmedNonstopDirections).toBe(0);
    expect(dataProgressSchema.safeParse({ ...status, qualified: { ...status.qualified, routes: -1 } }).success).toBe(false);
  });

  it('keeps snapshot-age and short-source-window checks independent', () => {
    const value = dataProgressSchema.parse({
      version: 1,
      generatedAt: '2026-10-01T18:00:00Z',
      state: 'verified',
      legacy: { total: 31658, published: 31068 },
      qualified: {
        airports: 5355, routes: 0, services: 0, board: 2586, historical: 755, endpoints: 2916,
        sourceDate: '2026-10-01',
        avinor: { references: 159, rawFlights: 160, held: 1, capturedAt: '2026-10-02T07:29:50Z', from: '2026-10-02T05:45:00Z', until: '2026-10-02T14:00:00Z', confirmedNonstopDirections: 0 },
      },
    });
    expect(progressIsStale(value, new Date('2026-10-03'))).toBe(false);
    expect(progressIsStale(value, new Date('2026-10-09'))).toBe(true);
    expect(avinorWindowExpired(value, new Date('2026-10-02T13:00:00Z'))).toBe(false);
    expect(avinorWindowExpired(value, new Date('2026-10-02T15:00:00Z'))).toBe(true);
  });
});
