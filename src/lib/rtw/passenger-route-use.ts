import raw from '../../../public/data/passenger-route-use/current.json' with { type: 'json' };
import { PassengerRouteUseCatalogSchema, type PassengerRouteUseCatalog } from '../schemas/passenger-route-use.ts';

export const passengerRouteUseCatalog = PassengerRouteUseCatalogSchema.parse(raw);

/** Only explicitly reviewed exceptional sectors are gated here. Unlisted
 * routes retain the existing operator/date/product evidence pipeline; this
 * function never certifies a flight, seat, price, or actual ticket issuance. */
export function passengerRouteUseDecision(
  carrier: string, from: string, to: string, date: string, productId?: string,
  catalog: PassengerRouteUseCatalog = passengerRouteUseCatalog,
): 'existing-pipeline' | 'verified-product-use' | 'local-sale-unverified' | 'product-use-unverified' {
  const entry = catalog.entries.find(row => row.carrier === carrier && row.pair[0] === from && row.pair[1] === to);
  if (!entry) return 'existing-pipeline';
  if (entry.localPassengerSale !== 'permitted'
    || (entry.rightsFrom && date < entry.rightsFrom) || (entry.rightsUntil && date > entry.rightsUntil)) return 'local-sale-unverified';
  const product = entry.products.find(row => row.productId === productId);
  return product?.status === 'verified' && date >= product.validFrom && date <= product.validUntil
    ? 'verified-product-use' : 'product-use-unverified';
}

export function canUsePassengerRoute(carrier: string, from: string, to: string, date: string, productId?: string): boolean {
  const decision = passengerRouteUseDecision(carrier, from, to, date, productId);
  return decision === 'existing-pipeline' || decision === 'verified-product-use';
}
