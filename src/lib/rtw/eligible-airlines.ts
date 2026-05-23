import type { AllianceCatalog } from '../schemas/alliance.ts';
import type { RtwRuleSet } from '../schemas/rtw-rule.ts';
import type { Airline, AirlineIata } from '../types.ts';

function eligibleCarrierCodes(
  product: RtwRuleSet | undefined,
  allianceCatalog: AllianceCatalog,
): ReadonlySet<AirlineIata> {
  if (!product) return new Set();
  if (product.airlineEligibility.type === 'explicit-airline-set') {
    return new Set(product.airlineEligibility.airlines);
  }

  const eligibility = product.airlineEligibility;
  const allowedStatuses = eligibility.includeAffiliates
    ? new Set(['member', 'affiliate', 'connect'])
    : new Set(['member']);

  return new Set(
    allianceCatalog.memberships
      .filter(
        (membership) =>
          membership.alliance === eligibility.alliance &&
          allowedStatuses.has(membership.status),
      )
      .map((membership) => membership.airline),
  );
}

export function eligibleAirlinesForProduct(
  product: RtwRuleSet | undefined,
  airlines: ReadonlyArray<Airline>,
  allianceCatalog: AllianceCatalog,
): ReadonlyArray<Airline> {
  const eligibleCodes = eligibleCarrierCodes(product, allianceCatalog);
  if (eligibleCodes.size === 0) return airlines;

  const airlineByCode = new Map(airlines.map((airline) => [airline.iata, airline]));
  return [...eligibleCodes]
    .map((code) => airlineByCode.get(code))
    .filter((airline): airline is Airline => airline !== undefined)
    .sort((a, b) => a.iata.localeCompare(b.iata));
}

export function isCarrierEligibleForProduct(
  carrier: AirlineIata,
  product: RtwRuleSet | undefined,
  allianceCatalog: AllianceCatalog,
): boolean {
  const eligibleCodes = eligibleCarrierCodes(product, allianceCatalog);
  return eligibleCodes.size === 0 || eligibleCodes.has(carrier);
}

export function firstEligibleCarrierForProduct(
  product: RtwRuleSet | undefined,
  airlines: ReadonlyArray<Airline>,
  allianceCatalog: AllianceCatalog,
  fallback: AirlineIata,
): AirlineIata {
  const eligible = eligibleAirlinesForProduct(product, airlines, allianceCatalog);
  return eligible.some((airline) => airline.iata === fallback) ? fallback : eligible[0]?.iata ?? fallback;
}
