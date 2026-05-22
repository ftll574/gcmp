import type { MarketProfile, MarketRtwRelevance } from '../schemas/market.ts';
import type { RtwRuleSet } from '../schemas/rtw-rule.ts';
import type { AirlineIata } from '../types.ts';

const RELEVANCE_SCORE: Record<MarketRtwRelevance, number> = {
  primary: 50,
  secondary: 30,
  limited: 10,
  watch: 5,
  negative: -20,
};

export function scoreRtwProduct(productId: string, marketProfile: MarketProfile): number {
  const entry = marketProfile.priorityPrograms.find((program) => program.id === productId);
  if (!entry) return 0;
  const roleBonus = entry.roles.includes('alliance-rtw-fare') ? 10 : 0;
  return RELEVANCE_SCORE[entry.rtwRelevance] + roleBonus;
}

export function sortRtwProductsForMarket(
  products: ReadonlyArray<RtwRuleSet>,
  marketProfile: MarketProfile,
): RtwRuleSet[] {
  return [...products].sort(
    (a, b) => scoreRtwProduct(b.id, marketProfile) - scoreRtwProduct(a.id, marketProfile),
  );
}

export function preferredCarrierForProduct(
  product: RtwRuleSet | undefined,
  marketProfile: MarketProfile,
): AirlineIata {
  if (product?.airline) return product.airline as AirlineIata;
  const match = marketProfile.priorityAirlines.find(
    (airline) =>
      airline.alliance === product?.alliance &&
      (airline.rtwRelevance === 'primary' || airline.roles.includes('home-airline')),
  );
  return (match?.airline ?? 'BR') as AirlineIata;
}
