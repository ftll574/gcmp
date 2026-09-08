import type { OfficialScheduleCatalog } from '../schemas/published-schedules.ts';
import type { RouteNetworkCatalog, RouteNetworkEntry } from '../schemas/route-network.ts';

/** A dated official timetable also supplies directional route evidence.
 * Do not turn this view into weekly schedules: the date calendar remains
 * responsible for weekdays, exceptions and publication review deadlines. */
export function withOfficialRoutes(network: RouteNetworkCatalog | null, catalog: OfficialScheduleCatalog, date: string): RouteNetworkCatalog {
  const routes = new Map<string, RouteNetworkEntry>((network?.routes ?? []).map((row) => [`${row.carrier}:${row.pair.join('-')}`, row]));
  const sources = [...(network?.sources ?? [])];
  for (const [id, source] of Object.entries(catalog.sources)) {
    sources.push({ id: `official-${id}`, url: source.url, checkedOn: source.checkedAt.slice(0, 10),
      ...(source.publishedOn ? { publishedOn: source.publishedOn } : {}),
      note: `${source.name}. Publication-based route evidence; use the date calendar for operating dates.`,
    });
  }
  for (const row of catalog.services) {
    if (date < row.effectiveFrom || date > row.effectiveUntil) continue;
    const key = `${row.carrier}:${row.from}-${row.to}`;
    if (routes.has(key)) continue; // Existing suspensions must not be overwritten.
    routes.set(key, { carrier: row.carrier, pair: [row.from, row.to], service: 'nonstop', status: 'published',
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
