import type { AwardPricingCatalog } from '../schemas/award-pricing.ts';
import type { CiZoneMap } from '../schemas/ci-zones.ts';
import { getZonePairQuote } from './award-pricing.ts';
import type { AwardZonePairQuote } from './award-pricing.ts';
import type { CabinId } from '../types.ts';

/**
 * Result of resolving one airport to its CI chart zone. Exact IATA match
 * or nothing — no fuzzy matching, no prefix matching, no guessing.
 */
export interface CiZoneResolution {
  readonly zone: string;
  readonly confidence: 'chart-verified' | 'community-corrected';
}

/**
 * Resolve one airport to its CI zone via EXACT IATA code match against the
 * parsed zone map. Returns null when the map carries no row for the airport
 * — an unmapped endpoint never falls back to a guessed region.
 */
export function resolveCiZone(map: CiZoneMap, airport: string): CiZoneResolution | null {
  const assignment = map.assignments.find((candidate) => candidate.airport === airport);
  if (!assignment) return null;
  return { zone: assignment.zone, confidence: assignment.confidence };
}

/**
 * Quote ONE award leg through the CI SkyTeam partner zone chart
 * (docs/calibration-set.md §A8). Pure, UI-free — sits beside the rest of
 * src/lib/rtw/* engine code.
 *
 * Pipeline:
 *
 *   fromAirport ──┐
 *                ├─ resolveCiZone ─▶ zone pair ─ getZonePairQuote ─▶ quote | null
 *   toAirport ───┘    (null on miss)              (null on cell/cabin miss)
 *
 * Both endpoints must resolve; either miss yields null. The zone-pair
 * lookup itself is REUSED, not reimplemented — getZonePairQuote() already
 * owns the undirected upper-triangle matrix math, the canonical stored
 * direction reporting (originRegion/destinationRegion on the returned
 * quote), and the null contract for unknown products / absent cells /
 * unpriced cabins.
 */
export function quoteCiLeg(options: {
  catalog: AwardPricingCatalog;
  productId: string;
  zoneMap: CiZoneMap;
  fromAirport: string;
  toAirport: string;
  cabin: CabinId;
}): AwardZonePairQuote | null {
  const origin = resolveCiZone(options.zoneMap, options.fromAirport);
  if (!origin) return null;
  const destination = resolveCiZone(options.zoneMap, options.toAirport);
  if (!destination) return null;

  return getZonePairQuote(
    options.catalog,
    options.productId,
    origin.zone,
    destination.zone,
    options.cabin,
  );
}
