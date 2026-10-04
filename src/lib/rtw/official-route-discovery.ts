import type { OfficialScheduleCatalog } from '../schemas/published-schedules.ts';
import type { RouteNetworkCatalog, RouteNetworkEntry } from '../schemas/route-network.ts';
import { carrierRouteKey } from '../carrier-identity.ts';

/** A dated official timetable also supplies directional route evidence.
 * Do not turn this view into weekly schedules: the date calendar remains
 * responsible for weekdays, exceptions and publication review deadlines. */
export function withOfficialRoutes(network: RouteNetworkCatalog | null, catalog: OfficialScheduleCatalog, date: string): RouteNetworkCatalog {
  const routes = new Map<string, RouteNetworkEntry>((network?.routes ?? []).map((row) => [carrierRouteKey(row, ...row.pair), row]));
  const sources = [...(network?.sources ?? [])];
  for (const [id, source] of Object.entries(catalog.sources)) {
    sources.push({ id: `official-${id}`, url: source.url, checkedOn: source.checkedAt.slice(0, 10),
      ...(source.publishedOn ? { publishedOn: source.publishedOn } : {}),
      note: `${source.name}. Publication-based route evidence; use the date calendar for operating dates.`,
    });
  }
  for (const row of catalog.services) {
    if (date < row.effectiveFrom || date > row.effectiveUntil) continue;
    const hasQualifiedPeers = (network?.routes ?? []).some(route => route.carrier === row.carrier && route.carrierEntityKey);
    // An IATA-only schedule cannot be assigned to one of several qualified
    // operators. Do not manufacture an unqualified duplicate or guess a peer.
    if (!row.carrierEntityKey && (row.carrier === '2F' || hasQualifiedPeers)) continue;
    const key = carrierRouteKey(row, row.from, row.to);
    if (routes.has(key)) continue; // Existing suspensions must not be overwritten.
    routes.set(key, { carrier: row.carrier, ...(row.carrierEntityKey ? { carrierEntityKey: row.carrierEntityKey } : {}), ...(row.carrierEntityName ? { carrierEntityName: row.carrierEntityName } : {}), pair: [row.from, row.to], service: 'nonstop', status: 'published',
      sourceIds: [`official-${row.sourceId}`], effectiveFrom: row.effectiveFrom, effectiveUntil: row.effectiveUntil });
  }
  return {
    version: network?.version ?? '2026.3',
    coverage: 'curated-not-complete',
    sources,
    carrierUniverses: network?.carrierUniverses ?? [],
    routes: [...routes.values()],
  };
}
