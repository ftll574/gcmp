import type { RtwFinding } from './validate.ts';

/**
 * Violation fix hints v1 (docs/convergence-contract.md §3).
 *
 * Maps FAIL-severity findings of the top-5 high-frequency rules to ONE
 * textual remedy pattern each — identify-the-problem-plus-how-to-fix,
 * never an auto-generated alternative route (explicitly out of scope
 * until v1 ships and survives contact with users):
 *
 *   finding(ruleId, severity, params) ─▶ fixHintForFinding() ─▶ hint | null
 *                                          │
 *   covered + fail ─▶ remedyKey(+params)   │
 *   anything else  ─▶ null (rule text only)│
 *
 * Pure module: no React, no i18n — remedyKey/params are the neutral
 * interchange form, localized by the caller via t(). Coverage is bounded
 * by the contract; every other ruleId returns null and the UI falls back
 * to the existing rule message/source link.
 */

export interface RtwFixHint {
  readonly ruleId: string;
  /** i18n key under `rtw.fix.*` describing the concrete remedy. */
  readonly remedyKey: string;
  readonly remedyParams?: Readonly<Record<string, string | number>>;
  /** 1-based leg numbers worth touching, mirroring the finding's targets. */
  readonly legs?: ReadonlyArray<number>;
}

/** Numeric context the findings alone don't carry (locale-formatted there). */
export interface FixHintContext {
  /** Engine-computed priced total (summary.totalDistanceMiles). */
  readonly totalDistanceMiles?: number | undefined;
  /** The product's raw distance cap (limits.maxDistanceMiles), if any. */
  readonly distanceCapMiles?: number | undefined;
}

/** Covered rule ids — everything else intentionally falls back to null. */
const COVERED_RULE_IDS: ReadonlySet<string> = new Set([
  'flight-segments',
  'stopovers',
  'max-distance',
  'airline-eligibility',
  'ocean-crossings',
]);

function numberParam(
  params: Readonly<Record<string, string | number>> | undefined,
  key: string,
): number | undefined {
  const value = params?.[key];
  return typeof value === 'number' ? value : undefined;
}

function oceanMissingKeys(missing: string | undefined): ReadonlyArray<string> {
  return (missing ?? '')
    .split(', ')
    .map((ocean) => ocean.trim().toLowerCase())
    .filter((ocean) => ocean.length > 0);
}

/**
 * One remedy hint for a FAIL finding of a covered rule; null otherwise —
 * including every pass/warning/unknown severity (nothing to fix) and every
 * uncovered ruleId (contract §3: fall back to existing rule text).
 */
export function fixHintForFinding(
  finding: Pick<RtwFinding, 'ruleId' | 'severity' | 'messageParams' | 'affectedLegIndexes'>,
  context: FixHintContext = {},
): RtwFixHint | null {
  if (finding.severity !== 'fail') return null;
  if (!COVERED_RULE_IDS.has(finding.ruleId)) return null;
  const params = finding.messageParams;

  switch (finding.ruleId) {
    case 'flight-segments': {
      // Fail means tooFew OR tooMany; the branch is recoverable from the
      // counts. max may be the string 'unlimited' (then tooMany is
      // impossible by construction — only the tooFew branch can fire).
      const count = numberParam(params, 'count');
      const min = numberParam(params, 'min');
      const max = numberParam(params, 'max');
      if (count === undefined) return null;
      if (max !== undefined && count > max) {
        return {
          ruleId: finding.ruleId,
          remedyKey: 'rtw.fix.flightSegmentsTooMany',
          remedyParams: { drop: count - max },
        };
      }
      if (min !== undefined && count < min) {
        return {
          ruleId: finding.ruleId,
          remedyKey: 'rtw.fix.flightSegmentsTooFew',
          remedyParams: { add: min - count },
        };
      }
      return null;
    }

    case 'stopovers': {
      // Same tooMany/tooFew split; the engine only fails on tooFew when no
      // stopover flags are unknown, so both branches are actionable.
      const count = numberParam(params, 'count');
      const min = numberParam(params, 'min');
      const max = numberParam(params, 'max');
      if (count === undefined) return null;
      if (max !== undefined && count > max) {
        return {
          ruleId: finding.ruleId,
          remedyKey: 'rtw.fix.stopoversTooMany',
          remedyParams: { convert: count - max },
        };
      }
      if (min !== undefined && count < min) {
        return {
          ruleId: finding.ruleId,
          remedyKey: 'rtw.fix.stopoversTooFew',
          remedyParams: { promote: min - count },
        };
      }
      return null;
    }

    case 'max-distance': {
      // The finding's own params are locale-FORMATTED strings ("35,000"),
      // so the arithmetic uses the raw numeric context instead. With both
      // numbers present the hint names the exact overage; without them it
      // stays honest and generic rather than printing {over}.
      const { totalDistanceMiles, distanceCapMiles } = context;
      if (
        typeof totalDistanceMiles === 'number' &&
        typeof distanceCapMiles === 'number' &&
        totalDistanceMiles > distanceCapMiles
      ) {
        return {
          ruleId: finding.ruleId,
          remedyKey: 'rtw.fix.maxDistanceNumbered',
          remedyParams: { over: (totalDistanceMiles - distanceCapMiles).toLocaleString() },
        };
      }
      return {
        ruleId: finding.ruleId,
        remedyKey: 'rtw.fix.maxDistanceGeneric',
      };
    }

    case 'airline-eligibility':
      return {
        ruleId: finding.ruleId,
        remedyKey: 'rtw.fix.airlineEligibility',
        ...(finding.affectedLegIndexes !== undefined
          ? {
              legs: finding.affectedLegIndexes.map((index) => index + 1),
              remedyParams: {
                legs: finding.affectedLegIndexes.map((index) => index + 1).join(', '),
              },
            }
          : {}),
      };

    case 'ocean-crossings': {
      // The missing set comes through as "Pacific", "Atlantic", or
      // "Pacific, Atlantic" (see validate.ts). Three constructions, three
      // remedies — a route needing both oceans is a different fix than one
      // needing either single crossing.
      const missing = oceanMissingKeys(
        typeof params?.missing === 'string' ? params.missing : undefined,
      );
      const hasPacific = missing.includes('pacific');
      const hasAtlantic = missing.includes('atlantic');
      if (hasPacific && hasAtlantic) {
        return { ruleId: finding.ruleId, remedyKey: 'rtw.fix.oceanMissingBoth' };
      }
      if (hasPacific) {
        return { ruleId: finding.ruleId, remedyKey: 'rtw.fix.oceanMissingPacific' };
      }
      if (hasAtlantic) {
        return { ruleId: finding.ruleId, remedyKey: 'rtw.fix.oceanMissingAtlantic' };
      }
      return null;
    }

    default:
      return null;
  }
}
