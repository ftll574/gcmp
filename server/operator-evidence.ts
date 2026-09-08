import type { z } from 'zod';
import schedulesRaw from '../public/data/schedules/current.json' with { type: 'json' };
import { officialScheduleCatalog } from '../src/lib/official-schedule-catalog.ts';
import { PublicationSourceSchema } from '../src/lib/schemas/published-schedules.ts';
import { parseScheduleCatalog } from '../src/lib/schemas/flight-schedules.ts';
import { isoWeekday } from '../src/lib/rtw/schedule-days.ts';

type PublicationSource = z.infer<typeof PublicationSourceSchema>;

interface OperatorEvidenceRecord {
  from: string;
  to: string;
  carrier: string;
  flightNumbers: ReadonlySet<string>;
  effectiveFrom?: string;
  effectiveUntil?: string;
  source: PublicationSource;
}

interface NonOperatorEvidenceRecord extends OperatorEvidenceRecord {
  operatingCarrier: string;
}

const scheduleCatalog = parseScheduleCatalog(schedulesRaw);
const SCHEDULE_CATALOG_CHECKED_AT = `${scheduleCatalog.lastVerified}T00:00:00.000Z`;
const SCHEDULE_CATALOG_REVIEW_BY = '2026-09-25T00:00:00.000Z';

// This is the actual review round for the independent operator evidence.
// It intentionally post-dates the 17:09Z TDX snapshot: historical replay at
// capture time must NOT pretend this evidence was already known then.
export const OPERATOR_EVIDENCE_CHECKED_AT = '2026-09-05T17:43:00.000Z';
const CHECKED_AT = OPERATOR_EVIDENCE_CHECKED_AT;
const REVIEW_BY = '2026-10-05T17:43:00.000Z';
export const CX_INITIAL_OPERATOR_EVIDENCE_CHECKED_AT = '2026-09-05T19:30:00.000Z';
const CX_INITIAL_REVIEW_BY = '2026-09-19T19:30:00.000Z';
const CX_COMPLETION_CHECKED_AT = '2026-09-05T23:45:00.000Z';
const CX_COMPLETION_REVIEW_BY = '2026-09-19T23:45:00.000Z';
const BR_BKK_CODESHARE_CHECKED_AT = '2026-09-07T19:23:00.000Z';
const BR_BKK_CODESHARE_REVIEW_BY = '2026-09-21T19:23:00.000Z';
export const LATEST_OPERATOR_EVIDENCE_CHECKED_AT = CX_COMPLETION_CHECKED_AT;

/**
 * Direct operator-identity evidence, deliberately separate from TDX's
 * date/weekday publication evidence. EVA's own Flight Status says it
 * does not provide information for codeshare flights operated by other
 * carriers; the cited status pages explicitly list these BR flight numbers
 * on the stated directional airport pairs. Therefore these exact identities
 * may be promoted from TDX designators to BR-operated timetable occurrences.
 *
 * Do NOT generalize by BR prefix. Date-bounded chart-verified schedule
 * evidence is handled separately below; CX and other unmatched designators
 * remain unverified.
 */
const records: ReadonlyArray<OperatorEvidenceRecord> = [
  {
    from: 'TPE', to: 'HKG', carrier: 'BR',
    flightNumbers: new Set(['809', '851', '857', '867', '869', '871', '891']),
    source: PublicationSourceSchema.parse({
      name: 'EVA Air official flight status',
      url: 'https://booking.evaair.com/flyeva/eva/b2c/flight-status-erc.aspx?ACTCODE=&Orderby=&REASON=&airport=TPE%2FTSA%2FKHH&cmstitle=erc-note1&date=20260710-20260713&lang=&reqtime=',
      kind: 'airline-publication', checkedAt: CHECKED_AT, reviewBy: REVIEW_BY,
    }),
  },
  {
    from: 'HKG', to: 'TPE', carrier: 'BR',
    flightNumbers: new Set(['810', '852', '858', '868', '870', '872', '892']),
    source: PublicationSourceSchema.parse({
      name: 'EVA Air official flight status',
      url: 'https://booking.evaair.com/flyeva/eva/b2c/flight-status-erc.aspx?ACTCODE=&Orderby=&REASON=&airport=HKG%2FMFM%2FCAN%2FSZX&cmstitle=erc-note1&date=20260725-20260727&lang=zh-tw&reqtime=',
      kind: 'airline-publication', checkedAt: CHECKED_AT, reviewBy: REVIEW_BY,
    }),
  },
  {
    from: 'TPE', to: 'SFO', carrier: 'BR',
    flightNumbers: new Set(['8', '18']),
    source: PublicationSourceSchema.parse({
      name: 'EVA Air official flight status',
      url: 'https://booking.evaair.com/flyeva/eva/b2c/flight-status-erc.aspx?ACTCODE=&Orderby=&REASON=&airport=TPE%2FTSA%2FKHH&cmstitle=erc-note1&date=20260710-20260713&lang=&reqtime=',
      kind: 'airline-publication', checkedAt: CHECKED_AT, reviewBy: REVIEW_BY,
    }),
  },
  {
    from: 'TPE', to: 'HKG', carrier: 'CX',
    flightNumbers: new Set(['407', '421', '443', '451', '469', '473']),
    effectiveFrom: '2026-09-06', effectiveUntil: '2026-09-14',
    source: PublicationSourceSchema.parse({
      name: 'Cross-source CX exact schedule',
      url: 'https://www.flight.info/CX407',
      kind: 'industry-timetable', checkedAt: CX_INITIAL_OPERATOR_EVIDENCE_CHECKED_AT, reviewBy: CX_INITIAL_REVIEW_BY,
    }),
  },
  {
    from: 'HKG', to: 'TPE', carrier: 'CX',
    flightNumbers: new Set(['400', '402', '408', '420']),
    effectiveFrom: '2026-09-06', effectiveUntil: '2026-09-14',
    source: PublicationSourceSchema.parse({
      name: 'Cross-source CX exact schedule',
      url: 'https://www.flight.info/CX400',
      kind: 'industry-timetable', checkedAt: CX_INITIAL_OPERATOR_EVIDENCE_CHECKED_AT, reviewBy: CX_INITIAL_REVIEW_BY,
    }),
  },
  {
    from: 'TPE', to: 'HKG', carrier: 'CX',
    flightNumbers: new Set(['461', '477', '479', '489', '495', '531', '565']),
    effectiveFrom: '2026-09-06', effectiveUntil: '2026-09-14',
    source: PublicationSourceSchema.parse({
      name: 'Cross-source CX exact schedule',
      url: 'https://www.directflights.com/TPE-HKG/37/2026/XX/noreturn',
      kind: 'industry-timetable', checkedAt: CX_COMPLETION_CHECKED_AT, reviewBy: CX_COMPLETION_REVIEW_BY,
    }),
  },
  {
    from: 'HKG', to: 'TPE', carrier: 'CX',
    flightNumbers: new Set(['422', '450', '464', '466', '472', '488', '494', '530', '564']),
    effectiveFrom: '2026-09-06', effectiveUntil: '2026-09-14',
    source: PublicationSourceSchema.parse({
      name: 'Cross-source CX exact schedule',
      url: 'https://www.directflights.com/HKG-TPE',
      kind: 'industry-timetable', checkedAt: CX_COMPLETION_CHECKED_AT, reviewBy: CX_COMPLETION_REVIEW_BY,
    }),
  },
];

const nonOperatorRecords: ReadonlyArray<NonOperatorEvidenceRecord> = [
  {
    from: 'TPE', to: 'BKK', carrier: 'BR', flightNumbers: new Set(['2217']), operatingCarrier: 'TG',
    effectiveFrom: '2026-03-29', effectiveUntil: '2026-10-24',
    source: PublicationSourceSchema.parse({
      name: 'EVA/Thai codeshare schedule BR2217 / TG635', url: 'https://info.flightmapper.net/route/EVA_Air_BR_TPE_BKK',
      kind: 'industry-timetable', checkedAt: BR_BKK_CODESHARE_CHECKED_AT, reviewBy: BR_BKK_CODESHARE_REVIEW_BY,
    }),
  },
  {
    from: 'TPE', to: 'BKK', carrier: 'BR', flightNumbers: new Set(['2219']), operatingCarrier: 'TG',
    effectiveFrom: '2026-03-29', effectiveUntil: '2026-10-24',
    source: PublicationSourceSchema.parse({
      name: 'EVA/Thai codeshare schedule BR2219 / TG637', url: 'https://info.flightmapper.net/route/EVA_Air_BR_TPE_BKK',
      kind: 'industry-timetable', checkedAt: BR_BKK_CODESHARE_CHECKED_AT, reviewBy: BR_BKK_CODESHARE_REVIEW_BY,
    }),
  },
  {
    from: 'TPE', to: 'BKK', carrier: 'BR', flightNumbers: new Set(['2221']), operatingCarrier: 'TG',
    effectiveFrom: '2026-03-29', effectiveUntil: '2026-10-24',
    source: PublicationSourceSchema.parse({
      name: 'EVA/Thai codeshare schedule BR2221 / TG633', url: 'https://info.flightmapper.net/route/EVA_Air_BR_TPE_BKK',
      kind: 'industry-timetable', checkedAt: BR_BKK_CODESHARE_CHECKED_AT, reviewBy: BR_BKK_CODESHARE_REVIEW_BY,
    }),
  },
  {
    from: 'TPE', to: 'HKG', carrier: 'CX', flightNumbers: new Set(['5111']), operatingCarrier: 'UO',
    effectiveFrom: '2026-09-06', effectiveUntil: '2026-09-14',
    source: PublicationSourceSchema.parse({
      name: 'HK Express UO111 codeshare schedule', url: 'https://www.flight.info/UO111',
      kind: 'industry-timetable', checkedAt: CX_COMPLETION_CHECKED_AT, reviewBy: CX_COMPLETION_REVIEW_BY,
    }),
  },
  {
    from: 'TPE', to: 'HKG', carrier: 'CX', flightNumbers: new Set(['5117']), operatingCarrier: 'UO',
    effectiveFrom: '2026-09-06', effectiveUntil: '2026-09-14',
    source: PublicationSourceSchema.parse({
      name: 'HK Express UO117 codeshare schedule', url: 'https://www.flight.info/UO117',
      kind: 'industry-timetable', checkedAt: CX_COMPLETION_CHECKED_AT, reviewBy: CX_COMPLETION_REVIEW_BY,
    }),
  },
  {
    from: 'HKG', to: 'TPE', carrier: 'CX', flightNumbers: new Set(['5110']), operatingCarrier: 'UO',
    effectiveFrom: '2026-09-06', effectiveUntil: '2026-09-14',
    source: PublicationSourceSchema.parse({
      name: 'HK Express UO110 codeshare schedule', url: 'https://www.flight.info/UO110',
      kind: 'industry-timetable', checkedAt: CX_COMPLETION_CHECKED_AT, reviewBy: CX_COMPLETION_REVIEW_BY,
    }),
  },
];

function normalizedDesignator(carrier: string, number: string): string {
  return `${carrier}${number}`.replace(/^([A-Z0-9]{2})0+(?=\d)/, '$1');
}

function catalogEvidence(from: string, to: string, carrier: string, flightNumber: string, date: string, now: number): PublicationSource | null {
  const designator = normalizedDesignator(carrier, flightNumber);
  const entry = scheduleCatalog.entries.find((candidate) => candidate.carrier === carrier
    && candidate.pair[0] === from && candidate.pair[1] === to
    && candidate.confidence === 'chart-verified' && candidate.status !== 'suspended'
    && (!candidate.effectiveFrom || date >= candidate.effectiveFrom)
    && (!candidate.effectiveUntil || date <= candidate.effectiveUntil)
    && candidate.daysOfWeek.includes(isoWeekday(date))
    && candidate.flightNumbers?.some((number) => normalizedDesignator(carrier, number.replace(/^[A-Z0-9]{2}/, '')) === designator));
  if (!entry) return null;
  const url = entry.sourceUrls[0];
  if (!url) return null;
  const host = new URL(url).hostname;
  const kind = host === 'ecapi.starlux-airlines.com' || host.endsWith('china-airlines.com')
    ? 'airline-publication' as const
    : host === 'www.aeroroutes.com' ? 'industry-timetable' as const : null;
  if (!kind) return null;
  const source = PublicationSourceSchema.parse({
    name: host === 'ecapi.starlux-airlines.com' ? 'STARLUX official timetable API'
      : host === 'www.aeroroutes.com' ? 'Chart-verified airline schedule filing'
        : 'Airline official timetable',
    url, kind, checkedAt: SCHEDULE_CATALOG_CHECKED_AT, reviewBy: SCHEDULE_CATALOG_REVIEW_BY,
  });
  if (Date.parse(source.checkedAt) > now + 60_000 || Date.parse(source.reviewBy) <= now) return null;
  return source;
}

function officialServiceEvidence(from: string, to: string, carrier: string, flightNumber: string, date: string, now: number): PublicationSource | null {
  const service = officialScheduleCatalog.services.find((candidate) => candidate.from === from && candidate.to === to
    && candidate.carrier === carrier && candidate.flightNumber === flightNumber
    && date >= candidate.effectiveFrom && date <= candidate.effectiveUntil
    && !candidate.removedDates.includes(date)
    && (candidate.addedDates.includes(date) || candidate.daysOfWeek.includes(isoWeekday(date))));
  if (!service) return null;
  const source = officialScheduleCatalog.sources[service.sourceId];
  if (!source || Date.parse(source.checkedAt) > now + 60_000 || Date.parse(source.reviewBy) <= now) return null;
  return source;
}

export function findOperatorEvidence(from: string, to: string, carrier: string, flightNumber: string, date: string, now: number): PublicationSource | null {
  const source = records.find((record) => record.from === from && record.to === to
    && record.carrier === carrier && record.flightNumbers.has(flightNumber)
    && (!record.effectiveFrom || date >= record.effectiveFrom)
    && (!record.effectiveUntil || date <= record.effectiveUntil))?.source ?? null;
  if (source && Date.parse(source.checkedAt) <= now + 60_000 && Date.parse(source.reviewBy) > now) return source;
  return officialServiceEvidence(from, to, carrier, flightNumber, date, now)
    ?? catalogEvidence(from, to, carrier, flightNumber, date, now);
}

export function findKnownOtherOperator(from: string, to: string, carrier: string, flightNumber: string, date: string, now: number): { carrier: string; source: PublicationSource } | null {
  const record = nonOperatorRecords.find((candidate) => candidate.from === from && candidate.to === to
    && candidate.carrier === carrier && candidate.flightNumbers.has(flightNumber)
    && (!candidate.effectiveFrom || date >= candidate.effectiveFrom)
    && (!candidate.effectiveUntil || date <= candidate.effectiveUntil));
  if (!record || Date.parse(record.source.checkedAt) > now + 60_000 || Date.parse(record.source.reviewBy) <= now) return null;
  return { carrier: record.operatingCarrier, source: record.source };
}
