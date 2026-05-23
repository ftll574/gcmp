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

  it('reports carrier eligibility consistently with the filtered option set', () => {
    const oneworld = product('oneworld-explorer');

    expect(isCarrierEligibleForProduct('JL', oneworld, allianceCatalog)).toBe(true);
    expect(isCarrierEligibleForProduct('UA', oneworld, allianceCatalog)).toBe(false);
  });
});
