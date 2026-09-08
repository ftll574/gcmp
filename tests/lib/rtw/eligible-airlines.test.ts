import { describe, expect, it } from 'vitest';
import allianceRaw from '../../../public/data/alliances/current.json' with { type: 'json' };
import airlinesRaw from '../../../public/data/airlines.json' with { type: 'json' };
import rtwProductsRaw from '../../../public/data/rtw-products/current.json' with { type: 'json' };
import { eligibleAirlinesForProduct, isCarrierEligibleForProduct } from '../../../src/lib/rtw/eligible-airlines.ts';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';
import { RtwRuleCatalogSchema } from '../../../src/lib/schemas/rtw-rule.ts';
import type { Airline } from '../../../src/lib/types.ts';

const allianceCatalog = AllianceCatalogSchema.parse(allianceRaw);
const rtwCatalog = RtwRuleCatalogSchema.parse(rtwProductsRaw);
const airlines = airlinesRaw as ReadonlyArray<Airline>;

function product(id: string) {
  const found = rtwCatalog.products.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing RTW product ${id}`);
  return found;
}

describe('eligibleAirlinesForProduct', () => {
  it('keeps every catalog-eligible member selectable even when the legacy master is incomplete', () => {
    for (const candidate of rtwCatalog.products) {
      const codes = new Set(eligibleAirlinesForProduct(candidate, airlines, allianceCatalog).map(a => a.iata));
      for (const membership of allianceCatalog.memberships) {
        if (isCarrierEligibleForProduct(membership.airline, candidate, allianceCatalog)) {
          expect(codes.has(membership.airline), `${candidate.id}: ${membership.airline}`).toBe(true);
        }
      }
    }
  });

  it('uses the existing membership name without fabricating country or ICAO data', () => {
    const options = eligibleAirlinesForProduct(product('oneworld-explorer'), [], allianceCatalog);
    const fj = options.find(a => a.iata === 'FJ');
    expect(fj?.name).toBe(allianceCatalog.memberships.find(m => m.airline === 'FJ')?.airlineName);
    expect(fj?.country).toBe('');
    expect(fj?.icao).toBeUndefined();
    expect(options.some(a => a.iata === 'S7')).toBe(false);
  });

  it('filters oneworld products to oneworld operating carriers', () => {
    const eligible = eligibleAirlinesForProduct(product('oneworld-explorer'), airlines, allianceCatalog);
    const codes = new Set(eligible.map((airline) => airline.iata));

    expect(codes.has('AA')).toBe(true);
    expect(codes.has('BA')).toBe(true);
    expect(codes.has('CX')).toBe(true);
    expect(codes.has('BR')).toBe(false);
    expect(codes.has('CI')).toBe(false);
  });

  it('filters Star Alliance award products to Star Alliance member carriers', () => {
    const eligible = eligibleAirlinesForProduct(
      product('br-infinity-star-alliance-world-travel-award'),
      airlines,
      allianceCatalog,
    );
    const codes = new Set(eligible.map((airline) => airline.iata));

    expect(codes.has('BR')).toBe(true);
    expect(codes.has('SQ')).toBe(true);
    expect(codes.has('CX')).toBe(false);
  });

  it('filters the China Airlines SkyTeam product to all active SkyTeam members', () => {
    const eligible = eligibleAirlinesForProduct(
      product('china-airlines-skyteam-partner-award'),
      airlines,
      allianceCatalog,
    );
    const codes = new Set(eligible.map((airline) => airline.iata));

    expect(codes.size).toBe(18);
    for (const code of ['CI', 'DL', 'AF', 'KE', 'KL', 'VN', 'MF']) expect(codes.has(code)).toBe(true);
    expect(codes.has('BR')).toBe(false);
    expect(codes.has('CX')).toBe(false);
  });

  it('reports carrier eligibility consistently with the filtered option set', () => {
    const oneworld = product('oneworld-explorer');

    expect(isCarrierEligibleForProduct('JL', oneworld, allianceCatalog)).toBe(true);
    expect(isCarrierEligibleForProduct('UA', oneworld, allianceCatalog)).toBe(false);
  });
});
