/**
 * Routing engine entry point. Pure functions only — no React, no DOM.
 *
 *   computeRouting(request, inputs)  →  RoutingResult
 *
 * For each group:
 *   For each leg:
 *     1. Compute great-circle distance (haversine).
 *     2. For each requested program: look up earning rule for
 *        (operatingCarrier, cabin). Multiply distance × pqm/rdm, honoring
 *        minPerSegment.
 *   Aggregate per-group.
 * Then sum across groups for grand totals.
 *
 * Honesty:
 *   - Missing carrier → 0 + note + missingRule=true
 *   - Mixed confidence across legs → program-level confidence becomes 'mixed'
 *   - Antipodal pairs degrade gracefully
 */

import {
  ELITE_TIER_BONUS,
  PROGRAM_LABELS,
  type Airport,
  type CabinId,
  type EliteTier,
  type GroupResult,
  type LegDistance,
  type LegEarning,
  type ProgramEarning,
  type ProgramId,
  type RoutingGroup,
  type RoutingRequest,
  type RoutingResult,
} from '../types.ts';

/**
 * Programs that actually use revenue-based earning (PQP / Loyalty Points
 * / MQDs) in production. Our distance-multiplier numbers are cabin-bucket
 * approximations — flagged as "estimate" in the UI.
 *
 * UA killed distance-based PQM in 2020 → PQP = $1 spent on fare + carrier
 *   surcharges. AA Loyalty Points launched 2022. DL switched to MQDs in
 *   2020.
 */
const REVENUE_BASED_PROGRAMS = new Set<ProgramId>([
  'ua-mileageplus',
  'aa-aadvantage',
  'dl-skymiles',
]);
import type { Program, FareBucket } from '../schemas/program.ts';
import { crossesPolar, distanceNm } from './haversine.ts';

export interface EngineInputs {
  readonly airports: ReadonlyMap<string, Airport>;
  readonly programs: ReadonlyMap<ProgramId, Program>;
}

const CABIN_FALLBACK_ORDER: Record<CabinId, ReadonlyArray<string>> = {
  first: ['F', 'A', 'J', 'C', 'D'],
  business: ['J', 'C', 'D', 'I', 'Z'],
  'premium-economy': ['W', 'P', 'E'],
  economy: ['Y', 'B', 'M', 'H', 'K', 'L', 'Q', 'V', 'S', 'N', 'O'],
};

function resolveBucket(
  carrier: { fareBuckets: Record<string, FareBucket>; defaultLetterByCabin: Record<string, string> },
  cabin: CabinId,
  /**
   * Optional explicit fare-class override (e.g. "I", "D", "K"). When this
   * is set AND the carrier has a bucket for that exact letter, we use it
   * regardless of cabin. This is how Asian partner-credit math works
   * (CX I=25% vs J=150% in the same J cabin, etc.).
   *
   * When the explicit letter doesn't exist on this carrier, we fall back
   * to the cabin default — better than zero, with a warning surfaced
   * upstream.
   */
  fareClassOverride?: string,
): { bucket: FareBucket; letter: string; overrideMissing: boolean } | null {
  if (fareClassOverride) {
    const letter = fareClassOverride.toUpperCase();
    const bucket = carrier.fareBuckets[letter];
    if (bucket) return { bucket, letter, overrideMissing: false };
    // fall through to cabin default but flag the miss
  }
  const overrideMissing = fareClassOverride !== undefined && fareClassOverride !== '';
  const preferredLetter = carrier.defaultLetterByCabin[cabin];
  if (preferredLetter) {
    const bucket = carrier.fareBuckets[preferredLetter];
    if (bucket) return { bucket, letter: preferredLetter, overrideMissing };
  }
  for (const letter of CABIN_FALLBACK_ORDER[cabin]) {
    const bucket = carrier.fareBuckets[letter];
    if (bucket && bucket.cabin === cabin) {
      return { bucket, letter, overrideMissing };
    }
  }
  return null;
}

function emptyLegEarning(distanceNmValue: number, note: string): LegEarning {
  return {
    pqm: 0,
    rdm: 0,
    distanceNm: distanceNmValue,
    notes: [note],
    missingRule: true,
  };
}

function reconcileConfidence(
  per: ReadonlyArray<'chart-verified' | 'community-corrected' | 'mixed' | null>,
): ProgramEarning['confidence'] {
  const set = new Set(per.filter((c): c is 'chart-verified' | 'community-corrected' => !!c));
  if (set.size === 0) return 'chart-verified';
  if (set.size === 1) {
    const single = [...set][0];
    return single ?? 'chart-verified';
  }
  return 'mixed';
}

function computeGroup(
  group: RoutingGroup,
  cabin: CabinId,
  tier: EliteTier,
  requestedPrograms: ReadonlyArray<ProgramId>,
  airports: ReadonlyMap<string, Airport>,
  programs: ReadonlyMap<ProgramId, Program>,
): GroupResult {
  const byLeg: LegDistance[] = [];
  let totalDistanceNm = 0;
  const warnings: string[] = [];
  let polarDetected = false;

  for (const leg of group.legs) {
    const from = airports.get(leg.from);
    const to = airports.get(leg.to);
    if (!from || !to) {
      byLeg.push({ leg, distanceNm: 0 });
      warnings.push(`Unknown airport in leg ${leg.from}→${leg.to}`);
      continue;
    }
    const d = distanceNm(from, to);
    byLeg.push({ leg, distanceNm: d });
    totalDistanceNm += d;
    if (!polarDetected && crossesPolar(from, to, 70)) polarDetected = true;
  }
  if (polarDetected) {
    warnings.push('Route crosses polar region — distance accurate, but Mercator map will distort the arc.');
  }

  const programResults: Partial<Record<ProgramId, ProgramEarning>> = {};
  for (const programId of requestedPrograms) {
    const program = programs.get(programId);
    const label = PROGRAM_LABELS[programId] ?? programId;
    if (!program) {
      programResults[programId] = {
        programId,
        label,
        confidence: 'chart-verified',
        pqm: 0,
        rdm: 0,
        rdmBase: 0,
        tierBonus: 0,
        byLeg: byLeg.map((ld) =>
          emptyLegEarning(ld.distanceNm, `Program "${programId}" rules not loaded`),
        ),
        notes: [`Program "${programId}" rules not loaded`],
        rulesVersion: '',
        lastVerified: '',
        sourceUrl: '',
        revenueBased: REVENUE_BASED_PROGRAMS.has(programId),
      };
      continue;
    }

    let totalPqm = 0;
    let totalRdm = 0;
    const perLeg: LegEarning[] = [];
    const confidences: Array<'chart-verified' | 'community-corrected' | null> = [];
    const programNotes: string[] = [];

    for (const ld of byLeg) {
      if (ld.leg.surface === true) {
        perLeg.push(
          emptyLegEarning(
            ld.distanceNm,
            'Surface/open-jaw sector — no flight earning is computed for this segment.',
          ),
        );
        confidences.push(null);
        continue;
      }
      const op = ld.leg.operatingCarrier;
      const carrier = program.carriers[op];
      if (!carrier) {
        perLeg.push(
          emptyLegEarning(
            ld.distanceNm,
            `${program.label} has no earning rules for carrier ${op}. PR a rule file to add.`,
          ),
        );
        confidences.push(null);
        continue;
      }
      const resolved = resolveBucket(carrier, cabin, ld.leg.fareClass);
      if (!resolved) {
        perLeg.push(
          emptyLegEarning(
            ld.distanceNm,
            `${program.label}: no ${cabin} bucket for ${op}.`,
          ),
        );
        confidences.push(carrier.confidence);
        continue;
      }
      const { bucket, letter, overrideMissing } = resolved;
      const min = bucket.minPerSegment ?? 0;
      const raw = ld.distanceNm;
      const effective = Math.max(raw, min);
      const pqm = Math.round(effective * bucket.pqm);
      const rdm = Math.round(effective * bucket.rdm);
      totalPqm += pqm;
      totalRdm += rdm;
      const legNotes: string[] = [];
      if (raw < min) legNotes.push(`Minimum ${min} mi/segment applied.`);
      if (overrideMissing && ld.leg.fareClass) {
        legNotes.push(
          `${program.label} has no rule for ${op} fare class ${ld.leg.fareClass.toUpperCase()}; used ${letter} (cabin default).`,
        );
      }
      if (bucket.notes) legNotes.push(...bucket.notes);
      if (carrier.notes) legNotes.push(...carrier.notes);
      perLeg.push({ pqm, rdm, distanceNm: raw, notes: legNotes, missingRule: false });
      confidences.push(carrier.confidence);
    }

    if (program.globalNotes) programNotes.push(...program.globalNotes);

    // Apply elite-tier bonus to RDM only. PQM (Status Miles) is never
    // bonused — it's the qualifying metric for the tier you ARE.
    const bonus = ELITE_TIER_BONUS[tier];
    const rdmBase = totalRdm;
    const rdmWithBonus = bonus > 0 ? Math.round(rdmBase * (1 + bonus)) : rdmBase;

    programResults[programId] = {
      programId,
      label: program.label,
      ...(program.alliance !== undefined ? { alliance: program.alliance } : {}),
      confidence: reconcileConfidence(confidences),
      pqm: totalPqm,
      rdm: rdmWithBonus,
      rdmBase,
      tierBonus: bonus,
      byLeg: perLeg,
      notes: programNotes,
      rulesVersion: program.version,
      lastVerified: program.lastVerified,
      sourceUrl: program.sourceUrl,
      revenueBased: REVENUE_BASED_PROGRAMS.has(programId),
    };
  }

  return {
    totalDistanceNm,
    byLeg,
    programs: programResults as Record<ProgramId, ProgramEarning>,
    warnings,
  };
}

export function computeRouting(
  request: RoutingRequest,
  inputs: EngineInputs,
): RoutingResult {
  const tier: EliteTier = request.tier ?? 'none';
  const groups = request.groups.map((g) =>
    computeGroup(g, request.cabin, tier, request.programs, inputs.airports, inputs.programs),
  );

  const grandTotals: Partial<Record<ProgramId, { pqm: number; rdm: number }>> = {};
  for (const programId of request.programs) {
    grandTotals[programId] = { pqm: 0, rdm: 0 };
  }
  let grandTotalDistanceNm = 0;
  for (const g of groups) {
    grandTotalDistanceNm += g.totalDistanceNm;
    for (const programId of request.programs) {
      const e = g.programs[programId];
      if (e) {
        const t = grandTotals[programId]!;
        t.pqm += e.pqm;
        t.rdm += e.rdm;
      }
    }
  }

  return {
    groups,
    grandTotalDistanceNm,
    grandTotals: grandTotals as Record<ProgramId, { pqm: number; rdm: number }>,
    rulesVersionUsed: request.rulesVersion ?? 'current',
  };
}
