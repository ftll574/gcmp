/**
 * Routing engine entry point. Pure functions only — no React, no DOM.
 *
 *   computeRouting(request, airports, programs)  →  RoutingResult
 *
 * For each leg:
 *   1. Compute great-circle distance (haversine).
 *   2. For each requested program: look up earning rule for
 *      (operatingCarrier, cabin). Multiply distance × pqm/rdm, honoring
 *      minPerSegment. Aggregate across legs.
 *   3. Detect polar routes; add warning.
 *
 * Honesty:
 *   - Missing carrier in a program's rule set → 0 + note + missingRule=true
 *   - Mixed confidence across legs → program-level confidence becomes 'mixed'
 *   - Antipodal pairs degrade gracefully (haversine still works; UI shows arc)
 */

import {
  PROGRAM_LABELS,
  type Airport,
  type CabinId,
  type LegDistance,
  type LegEarning,
  type ProgramEarning,
  type ProgramId,
  type RoutingRequest,
  type RoutingResult,
} from '../types.ts';
import type { Program, FareBucket } from '../schemas/program.ts';
import { crossesPolar, distanceNm } from './haversine.ts';

export interface EngineInputs {
  readonly airports: ReadonlyMap<string, Airport>;
  /** Map of programId → loaded+validated Program rules. */
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
): { bucket: FareBucket; letter: string } | null {
  const preferredLetter = carrier.defaultLetterByCabin[cabin];
  if (preferredLetter) {
    const bucket = carrier.fareBuckets[preferredLetter];
    if (bucket) return { bucket, letter: preferredLetter };
  }
  // Fall back: try the conventional letters for this cabin.
  for (const letter of CABIN_FALLBACK_ORDER[cabin]) {
    const bucket = carrier.fareBuckets[letter];
    if (bucket && bucket.cabin === cabin) {
      return { bucket, letter };
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

/**
 * Compute distance + per-program earning for a routing.
 *
 *   request → for each leg:
 *               distance via haversine
 *               for each program: lookup carrier × cabin → multiply by distance
 *           ↓
 *   per-leg array + per-program totals + warnings
 */
export function computeRouting(
  request: RoutingRequest,
  inputs: EngineInputs,
): RoutingResult {
  const { airports, programs } = inputs;

  // Per-leg distances.
  const byLeg: LegDistance[] = [];
  let totalDistanceNm = 0;
  const warnings: string[] = [];
  let polarDetected = false;

  for (const leg of request.legs) {
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
    if (!polarDetected && crossesPolar(from, to, 70)) {
      polarDetected = true;
    }
  }

  if (polarDetected) {
    warnings.push(
      'Route crosses polar region — distance accurate, but Mercator map will distort the arc.',
    );
  }

  // Per-program totals.
  const programResults: Partial<Record<ProgramId, ProgramEarning>> = {};
  for (const programId of request.programs) {
    const program = programs.get(programId);
    const label = PROGRAM_LABELS[programId] ?? programId;
    if (!program) {
      programResults[programId] = {
        programId,
        label,
        confidence: 'chart-verified',
        pqm: 0,
        rdm: 0,
        byLeg: byLeg.map((ld) =>
          emptyLegEarning(ld.distanceNm, `Program "${programId}" rules not loaded`),
        ),
        notes: [`Program "${programId}" rules not loaded`],
      };
      continue;
    }

    let totalPqm = 0;
    let totalRdm = 0;
    const perLeg: LegEarning[] = [];
    const confidences: Array<'chart-verified' | 'community-corrected' | null> = [];
    const programNotes: string[] = [];

    for (const ld of byLeg) {
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
      const resolved = resolveBucket(carrier, request.cabin);
      if (!resolved) {
        perLeg.push(
          emptyLegEarning(
            ld.distanceNm,
            `${program.label}: no ${request.cabin} bucket for ${op}.`,
          ),
        );
        confidences.push(carrier.confidence);
        continue;
      }
      const { bucket } = resolved;
      const min = bucket.minPerSegment ?? 0;
      const rawDistance = ld.distanceNm;
      const effectiveDistance = Math.max(rawDistance, min);
      const pqm = Math.round(effectiveDistance * bucket.pqm);
      const rdm = Math.round(effectiveDistance * bucket.rdm);
      totalPqm += pqm;
      totalRdm += rdm;
      const legNotes: string[] = [];
      if (rawDistance < min) {
        legNotes.push(`Minimum ${min} mi/segment applied.`);
      }
      if (bucket.notes) legNotes.push(...bucket.notes);
      if (carrier.notes) legNotes.push(...carrier.notes);
      perLeg.push({
        pqm,
        rdm,
        distanceNm: rawDistance,
        notes: legNotes,
        missingRule: false,
      });
      confidences.push(carrier.confidence);
    }

    if (program.globalNotes) programNotes.push(...program.globalNotes);

    programResults[programId] = {
      programId,
      label: program.label,
      ...(program.alliance !== undefined ? { alliance: program.alliance } : {}),
      confidence: reconcileConfidence(confidences),
      pqm: totalPqm,
      rdm: totalRdm,
      byLeg: perLeg,
      notes: programNotes,
    };
  }

  // Cast the partial record back to the full type — we filled in entries for
  // every requested program (success or failure stub).
  const programs_record = programResults as Record<ProgramId, ProgramEarning>;

  return {
    totalDistanceNm,
    byLeg,
    programs: programs_record,
    warnings,
    rulesVersionUsed: request.rulesVersion ?? 'current',
  };
}
