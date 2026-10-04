import { z } from 'zod';
import { RouteNetworkSourceSchema } from './route-network.ts';

const ProductUseSchema = z.object({
  productId: z.string().min(1),
  status: z.enum(['verified', 'unknown', 'excluded']),
  sourceIds: z.array(z.string()).min(1),
  validFrom: z.iso.date(),
  validUntil: z.iso.date(),
}).strict();

/** Physical route evidence and operating identity do not establish local
 * passenger sale or use under a named RTW fare product. */
export const PassengerRouteUseCatalogSchema = z.object({
  version: z.literal(1),
  sources: z.array(RouteNetworkSourceSchema),
  entries: z.array(z.object({
    carrier: z.string().regex(/^[A-Z0-9]{2,3}$/),
    pair: z.tuple([z.string().regex(/^[A-Z]{3}$/), z.string().regex(/^[A-Z]{3}$/)]),
    localPassengerSale: z.enum(['permitted', 'unknown', 'not-permitted']),
    checkedOn: z.iso.date(),
    sourceIds: z.array(z.string()).min(1),
    rightsFrom: z.iso.date().optional(),
    rightsUntil: z.iso.date().optional(),
    products: z.array(ProductUseSchema),
    note: z.string().min(1),
  }).strict()),
}).strict().superRefine((catalog, ctx) => {
  const sources = new Set(catalog.sources.map(source => source.id));
  const keys = new Set<string>();
  catalog.entries.forEach((row, index) => {
    const key = `${row.carrier}:${row.pair.join('-')}`;
    if (keys.has(key)) ctx.addIssue({ code: 'custom', path: ['entries', index], message: 'Duplicate directed passenger-use rule' });
    keys.add(key);
    if (row.pair[0] === row.pair[1] || (row.rightsFrom && row.rightsUntil && row.rightsFrom > row.rightsUntil)) ctx.addIssue({ code: 'custom', path: ['entries', index], message: 'Invalid direction/rights interval' });
    const products = new Set<string>();
    row.products.forEach(product => {
      if (products.has(product.productId) || product.validFrom > product.validUntil) ctx.addIssue({ code: 'custom', path: ['entries', index, 'products'], message: 'Duplicate product or inverted product evidence interval' });
      products.add(product.productId);
    });
    for (const id of [...row.sourceIds, ...row.products.flatMap(product => product.sourceIds)]) if (!sources.has(id)) ctx.addIssue({ code: 'custom', path: ['entries', index, 'sourceIds'], message: `Unknown passenger-use source ${id}` });
  });
});
export type PassengerRouteUseCatalog = z.infer<typeof PassengerRouteUseCatalogSchema>;
