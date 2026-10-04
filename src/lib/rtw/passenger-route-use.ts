import raw from '../../../public/data/passenger-route-use/current.json' with { type: 'json' };
import { PassengerRouteUseCatalogSchema, type PassengerRouteUseCatalog } from '../schemas/passenger-route-use.ts';
import { carrierRouteKey } from '../carrier-identity.ts';

export const passengerRouteUseCatalog = PassengerRouteUseCatalogSchema.parse(raw);

/** Only explicitly reviewed exceptional sectors are gated here. Unlisted
 * routes retain the existing operator/date/product evidence pipeline; this
 * function never certifies a flight, seat, price, or actual ticket issuance. */
export function passengerRouteUseDecision(
  carrier: string, from: string, to: string, date: string, productId?: string,
  catalog: PassengerRouteUseCatalog = passengerRouteUseCatalog,
  carrierEntityKey?: string,
): 'existing-pipeline' | 'verified-product-use' | 'local-sale-unverified' | 'product-use-unverified' {
  const candidates = catalog.entries.filter(row => row.carrier === carrier && row.pair[0] === from && row.pair[1] === to);
  // Rules scoped to a qualified operator never spill over to another entity
  // sharing the IATA designator. An unqualified caller cannot establish which
  // entity a scoped restriction describes, so fail closed for that sector.
  if (carrierEntityKey) {
    if (candidates.some(row => row.carrierEntityKey === carrierEntityKey)) {
      const entry = candidates.find(row => carrierRouteKey(row, from, to) === `${carrierEntityKey}:${from}-${to}`)!;
      return decisionFor(entry, date, productId);
    }
    if (candidates.some(row => row.carrierEntityKey)) return 'existing-pipeline';
  } else if (candidates.some(row => row.carrierEntityKey)) {
    return 'local-sale-unverified';
  }
  const entry = candidates.find(row => !row.carrierEntityKey);
  if (!entry) return 'existing-pipeline';
  return decisionFor(entry, date, productId);
}

function decisionFor(entry: PassengerRouteUseCatalog['entries'][number], date: string, productId?: string): 'verified-product-use' | 'local-sale-unverified' | 'product-use-unverified' {
  if (entry.localPassengerSale !== 'permitted'
    || (entry.rightsFrom && date < entry.rightsFrom) || (entry.rightsUntil && date > entry.rightsUntil)) return 'local-sale-unverified';
  const product = entry.products.find(row => row.productId === productId);
  return product?.status === 'verified' && date >= product.validFrom && date <= product.validUntil
    ? 'verified-product-use' : 'product-use-unverified';
}

export function canUsePassengerRoute(carrier: string, from: string, to: string, date: string, productId?: string, carrierEntityKey?: string, catalog: PassengerRouteUseCatalog = passengerRouteUseCatalog): boolean {
  const decision = passengerRouteUseDecision(carrier, from, to, date, productId, catalog, carrierEntityKey);
  return decision === 'existing-pipeline' || decision === 'verified-product-use';
}
