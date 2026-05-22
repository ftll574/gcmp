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
  PROGRAM_LABELS,
  type Airport,
  type CabinId,
  type GroupResult,
  type LegDistance,
  type LegEarning,
  type ProgramEarning,
  type ProgramId,
  type RoutingGroup,
  type RoutingRequest,
  type RoutingResult,
} from '../types.ts';
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
): { bucket: FareBucket; letter: string } | null {
  const preferredLetter = carrier.defaultLetterByCabin[cabin];
  if (preferredLetter) {
    const bucket = carrier.fareBuckets[preferredLetter];
    if (bucket) return { bucket, letter: preferredLetter };
  }
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

function computeGroup(
  group: RoutingGroup,
  cabin: CabinId,
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
        byLeg: byLeg.map((ld) =>
          emptyLegEarning(ld.distanceNm, `Program "${programId}" rules not loaded`),
        ),
        notes: [`Program "${programId}" rules not loaded`],
        rulesVersion: '',
        lastVerified: '',
        sourceUrl: '',
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
      const resolved = resolveBucket(carrier, cabin);
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
      const { bucket } = resolved;
      const min = bucket.minPerSegment ?? 0;
      const raw = ld.distanceNm;
      const effective = Math.max(raw, min);
      const pqm = Math.round(effective * bucket.pqm);
      const rdm = Math.round(effective * bucket.rdm);
      totalPqm += pqm;
      totalRdm += rdm;
      const legNotes: string[] = [];
      if (raw < min) legNotes.push(`Minimum ${min} mi/segment applied.`);
      if (bucket.notes) legNotes.push(...bucket.notes);
      if (carrier.notes) legNotes.push(...carrier.notes);
      perLeg.push({ pqm, rdm, distanceNm: raw, notes: legNotes, missingRule: false });
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
      rulesVersion: program.version,
      lastVerified: program.lastVerified,
      sourceUrl: program.sourceUrl,
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
  const groups = request.groups.map((g) =>
    computeGroup(g, request.cabin, request.programs, inputs.airports, inputs.programs),
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
