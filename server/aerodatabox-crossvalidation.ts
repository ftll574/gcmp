import { z } from 'zod';
import { parseScheduleCatalog, type ScheduleCatalog } from '../src/lib/schemas/flight-schedules.ts';
import { isoWeekday } from '../src/lib/rtw/schedule-days.ts';

const Observation = z.object({
  from: z.string().regex(/^[A-Z]{3}$/), to: z.string().regex(/^[A-Z]{3}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), designator: z.string().regex(/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/),
  inferredOperator: z.string().regex(/^[A-Z0-9]{2}$/).nullable(),
  // Older saved calibration reports used high/medium before the AS7218/JX12
  // counterexample proved that AeroDataBox IsOperator is only provider-asserted.
  confidence: z.enum(['provider-asserted', 'high', 'medium', 'unknown', 'conflict']),
}).passthrough();

const CalibrationReport = z.object({
  observations: z.array(Observation),
}).passthrough();

export interface CrossValidationResult {
  from: string;
  to: string;
  date: string;
  designator: string;
  providerOperator: string | null;
  status: 'agreement' | 'conflict' | 'insufficient-evidence' | 'provider-unknown';
  independentCarrier: string | null;
  independentSources: string[];
  reason: string;
}

function normalizeFlightNumber(value: string): string {
  return value.trim().toUpperCase().replace(/^([A-Z0-9]{2})0+(?=\d)/, '$1');
}

function entryApplies(entry: ScheduleCatalog['entries'][number], date: string, designator: string): boolean {
  if (!entry.flightNumbers?.some((flight) => normalizeFlightNumber(flight) === designator)) return false;
  if (entry.effectiveFrom && date < entry.effectiveFrom) return false;
  if (entry.effectiveUntil && date > entry.effectiveUntil) return false;
  if (!entry.daysOfWeek.includes(isoWeekday(date))) return false;
  return entry.status !== 'suspended' && entry.confidence === 'chart-verified';
}

export function crossValidateAeroDataBox(reportRaw: unknown, scheduleRaw: unknown): {
  results: CrossValidationResult[];
  summary: { providerAsserted: number; agreement: number; conflict: number; insufficientEvidence: number; providerUnknown: number; verifiedRate: number };
} {
  const report = CalibrationReport.parse(reportRaw);
  const schedule = parseScheduleCatalog(scheduleRaw);
  const results = report.observations.map<CrossValidationResult>((observation) => {
    if (observation.inferredOperator === null) return {
      from: observation.from, to: observation.to, date: observation.date, designator: observation.designator,
      providerOperator: null, status: 'provider-unknown', independentCarrier: null, independentSources: [],
      reason: 'AeroDataBox did not establish a unique operator.',
    };
    const exact = schedule.entries.filter((entry) => entry.pair[0] === observation.from && entry.pair[1] === observation.to
      && entryApplies(entry, observation.date, observation.designator));
    const carriers = [...new Set(exact.map((entry) => entry.carrier))];
    const sources = [...new Set(exact.flatMap((entry) => entry.sourceUrls))].sort();
    if (carriers.length === 0) return {
      from: observation.from, to: observation.to, date: observation.date, designator: observation.designator,
      providerOperator: observation.inferredOperator, status: 'insufficient-evidence', independentCarrier: null,
      independentSources: [], reason: 'No independent chart-verified schedule is valid for this exact designator and date.',
    };
    if (carriers.length > 1) return {
      from: observation.from, to: observation.to, date: observation.date, designator: observation.designator,
      providerOperator: observation.inferredOperator, status: 'conflict', independentCarrier: null,
      independentSources: sources, reason: 'Independent catalog contains multiple carriers for the same exact designator/date.',
    };
    const independentCarrier = carriers[0]!;
    return {
      from: observation.from, to: observation.to, date: observation.date, designator: observation.designator,
      providerOperator: observation.inferredOperator,
      status: independentCarrier === observation.inferredOperator ? 'agreement' : 'conflict',
      independentCarrier, independentSources: sources,
      reason: independentCarrier === observation.inferredOperator
        ? 'AeroDataBox assertion agrees with an independent chart-verified exact flight/date record.'
        : 'AeroDataBox assertion conflicts with an independent chart-verified exact flight/date record.',
    };
  });
  const providerAsserted = results.filter((item) => item.providerOperator !== null).length;
  const agreement = results.filter((item) => item.status === 'agreement').length;
  const conflict = results.filter((item) => item.status === 'conflict').length;
  const insufficientEvidence = results.filter((item) => item.status === 'insufficient-evidence').length;
  const providerUnknown = results.filter((item) => item.status === 'provider-unknown').length;
  return { results, summary: { providerAsserted, agreement, conflict, insufficientEvidence, providerUnknown,
    verifiedRate: providerAsserted ? agreement / providerAsserted : 0 } };
}
