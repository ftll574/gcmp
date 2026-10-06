import { z } from 'zod';

const DateSchema = z.iso.date();
const SHA256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const CarrierSchema = z.string().regex(/^[A-Z0-9]{2,3}$/);
const AirportSchema = z.string().regex(/^[A-Z]{3}$/);
const SourceIdSchema = z.string().regex(/^caa-ogdl-(6066|9973)-20261001$/);
const CAA_SOURCE_PINS = {
  '6066': {
    id: 'caa-ogdl-6066-20261001',
    sha256: '5690304d65a8a0a62df920d8cf16227654674b34fff2a44f064f79d587286ea2',
    bytes: 130505,
    resource: 'https://www.caa.gov.tw/FileAtt.ashx?id=16680&lang=1',
    dataset: 'https://data.gov.tw/dataset/6066',
  },
  '9973': {
    id: 'caa-ogdl-9973-20261001',
    sha256: 'ebfd2e8f207a46f250fe48c53b53770d10a1fec342a18a73e19f349574bb0f35',
    bytes: 133668,
    resource: 'https://www.caa.gov.tw/FileAtt.ashx?id=16679&lang=1',
    dataset: 'https://data.gov.tw/dataset/9973',
  },
} as const;

const SourceSchema = z.object({
  id: SourceIdSchema,
  datasetId: z.enum(['6066', '9973']),
  kind: z.enum(['domestic', 'international']),
  title: z.string().min(1),
  attribution: z.literal('Taiwan Civil Aviation Administration (交通部民用航空局)'),
  datasetUrl: z.string().url(),
  resourceUrl: z.string().url(),
  hashPageUrl: z.string().url(),
  snapshotSha256: SHA256Schema,
  bytes: z.number().int().positive(),
  license: z.literal('OGDL-Taiwan-1.0'),
  licenseUrl: z.literal('https://data.gov.tw/license'),
  publishedOrUpdatedOn: DateSchema,
  retrievedAt: z.iso.datetime({ offset: true }),
}).strict().superRefine((source, ctx) => {
  const pin = CAA_SOURCE_PINS[source.datasetId];
  if (source.id !== pin.id || source.snapshotSha256 !== pin.sha256 || source.bytes !== pin.bytes
    || source.resourceUrl !== pin.resource || source.datasetUrl !== pin.dataset
    || source.kind !== (source.datasetId === '6066' ? 'domestic' : 'international')) {
    ctx.addIssue({ code: 'custom', message: 'CAA timetable source does not match the pinned official source contract' });
  }
});

const WeeklyWindowSchema = z.object({
  sourceId: SourceIdSchema,
  sourceLineNumbers: z.array(z.number().int().min(2)).min(1),
  status: z.enum(['published-window', 'conflicting-window']),
  validity: z.object({ from: DateSchema, until: DateSchema }).strict(),
  weekdaysISO: z.array(z.number().int().min(1).max(7)).min(1),
  weekdayMaskRaw: z.string().regex(/^[01][02][03][04][05][06][07]$/),
  departureTimeRaw: z.string().regex(/^\d{4}(?:\+[0-9])?$/),
  arrivalTimeRaw: z.string().regex(/^\d{4}(?:\+[0-9])?$/),
  departureTimeDisplay: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  arrivalTimeDisplay: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  arrivalDayOffset: z.number().int().min(0).max(9).nullable(),
  timezone: z.literal('not-defined-by-source'),
  codeshareInfoRaw: z.string(),
  reportedTransitAirports: z.array(AirportSchema),
  nonstopConfirmed: z.literal(false),
}).strict().superRefine((window, ctx) => {
  if (window.validity.from > window.validity.until) {
    ctx.addIssue({ code: 'custom', path: ['validity'], message: 'Inverted schedule validity period' });
  }
  const daysFromMask = [...window.weekdayMaskRaw]
    .flatMap((digit, index) => digit === '0' ? [] : [index + 1]);
  if (JSON.stringify(daysFromMask) !== JSON.stringify(window.weekdaysISO)) {
    ctx.addIssue({ code: 'custom', path: ['weekdaysISO'], message: 'CAA weekday mask and ISO weekdays disagree' });
  }
  for (const [raw, display, field] of [
    [window.departureTimeRaw, window.departureTimeDisplay, 'departureTimeDisplay'],
    [window.arrivalTimeRaw, window.arrivalTimeDisplay, 'arrivalTimeDisplay'],
  ] as const) {
    if (`${raw.slice(0, 2)}:${raw.slice(2, 4)}` !== display) {
      ctx.addIssue({ code: 'custom', path: [field], message: 'Display clock does not match original CAA clock' });
    }
  }
  const suffixOffset = window.arrivalTimeRaw.length > 4 ? Number(window.arrivalTimeRaw.slice(5)) : null;
  if (suffixOffset !== window.arrivalDayOffset) {
    ctx.addIssue({ code: 'custom', path: ['arrivalDayOffset'], message: 'Arrival-day marker does not match original CAA clock' });
  }
});

const AssociationSchema = z.object({
  key: z.string().min(1),
  carrier: CarrierSchema,
  flightDesignator: z.string().regex(/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/),
  from: AirportSchema,
  to: AirportSchema,
  tier: z.literal('schedule-verified-operator-unknown'),
  listedCarrierOnly: z.literal(true),
  operatingCarrier: z.null(),
  actualOperationConfirmed: z.literal(false),
  bookability: z.literal('unknown'),
  selectableOperatingService: z.literal(false),
  weeklyWindows: z.array(WeeklyWindowSchema).min(1),
}).strict().superRefine((association, ctx) => {
  const expectedKey = `${association.carrier}|${association.carrier}|${association.from}>${association.to}|${association.flightDesignator}`;
  if (association.key !== expectedKey || association.from === association.to || !association.flightDesignator.startsWith(association.carrier)) {
    ctx.addIssue({ code: 'custom', path: ['key'], message: 'CAA association must preserve canonical carrier, number and ordered endpoints' });
  }
  const windowKeys = new Set<string>();
  for (const [index, window] of association.weeklyWindows.entries()) {
    const key = [window.sourceId, window.validity.from, window.validity.until, window.weekdayMaskRaw, window.departureTimeRaw, window.arrivalTimeRaw, window.codeshareInfoRaw].join('|');
    if (windowKeys.has(key)) ctx.addIssue({ code: 'custom', path: ['weeklyWindows', index], message: 'Duplicate weekly schedule window' });
    windowKeys.add(key);
  }
});

export const CaaWeeklyScheduleTierSchema = z.object({
  version: z.literal(1),
  kind: z.literal('caa-weekly-schedule-reference-tier'),
  asOfDate: z.literal('2026-10-06'),
  candidateManifestSha256: z.literal('cac4e065b0e7d663aa321c1b9b4a0204d44f42758e0ed92dae5a3446ce81b66a'),
  candidateAssociationKeysSha256: z.literal('1b337e0fee9c5159675a7f91b57ca1b796bde1fb7eb85e2afa2ab8fecef5fdaa'),
  runtimeBaseSha256: z.literal('2bd353350db6d871099a2c2aa2aee23b63b0a7e65cccbbc502d9234eeb017c8a'),
  associationCount: z.literal(488),
  distinctDesignatorCount: z.literal(483),
  directedRouteCount: z.literal(253),
  operatorIdentity: z.literal('unknown'),
  actualOperationConfirmed: z.literal(false),
  bookability: z.literal('unknown'),
  selectableOperatingService: z.literal(false),
  sources: z.array(SourceSchema).length(2),
  associations: z.array(AssociationSchema).length(488),
}).strict().superRefine((tier, ctx) => {
  const sourceIds = new Set(tier.sources.map(source => source.id));
  const datasetIds = new Set(tier.sources.map(source => source.datasetId));
  const keys = new Set<string>();
  const designators = new Set<string>();
  const routes = new Set<string>();
  for (const [index, association] of tier.associations.entries()) {
    if (keys.has(association.key)) ctx.addIssue({ code: 'custom', path: ['associations', index, 'key'], message: 'Duplicate association key' });
    keys.add(association.key);
    designators.add(association.flightDesignator);
    routes.add(`${association.carrier}|${association.from}>${association.to}`);
    for (const [windowIndex, window] of association.weeklyWindows.entries()) {
      const source = tier.sources.find(item => item.id === window.sourceId);
      if (!source || !datasetIds.has(window.sourceId.includes('-6066-') ? '6066' : '9973') || !sourceIds.has(window.sourceId)) {
        ctx.addIssue({ code: 'custom', path: ['associations', index, 'weeklyWindows', windowIndex, 'sourceId'], message: 'Schedule window source is not in the pinned catalog' });
      }
      if (window.validity.until < tier.asOfDate) {
        ctx.addIssue({ code: 'custom', path: ['associations', index, 'weeklyWindows', windowIndex, 'validity'], message: 'Included schedule windows may not be fully expired at the evidence as-of date' });
      }
      if (!window.sourceLineNumbers.every((line, i, all) => i === 0 || all[i - 1]! < line)) {
        ctx.addIssue({ code: 'custom', path: ['associations', index, 'weeklyWindows', windowIndex, 'sourceLineNumbers'], message: 'Source line references must be strictly increasing' });
      }
    }
    if (!association.weeklyWindows.some(window => window.validity.from <= tier.asOfDate && tier.asOfDate <= window.validity.until)) {
      ctx.addIssue({ code: 'custom', path: ['associations', index, 'weeklyWindows'], message: 'Each association needs an active source window on the evidence as-of date' });
    }
  }
  if (keys.size !== tier.associationCount || designators.size !== tier.distinctDesignatorCount || routes.size !== tier.directedRouteCount) {
    ctx.addIssue({ code: 'custom', path: ['associations'], message: 'CAA schedule tier counts do not match its association rows' });
  }
  if (datasetIds.size !== 2) ctx.addIssue({ code: 'custom', path: ['sources'], message: 'Both CAA datasets are required' });
});

export type CaaWeeklyScheduleTier = z.infer<typeof CaaWeeklyScheduleTierSchema>;
export type CaaWeeklyScheduleAssociation = CaaWeeklyScheduleTier['associations'][number];
export type CaaWeeklyScheduleWindow = CaaWeeklyScheduleAssociation['weeklyWindows'][number];

export function parseCaaWeeklyScheduleTier(raw: unknown): CaaWeeklyScheduleTier {
  return CaaWeeklyScheduleTierSchema.parse(raw);
}

export type CaaScheduleDateState = 'listed' | 'outside-published-window' | 'not-listed-weekday' | 'conflicting-source-rows' | 'invalid-date';

export function caaScheduleWindowDateState(window: CaaWeeklyScheduleWindow, date: string): CaaScheduleDateState {
  if (!DateSchema.safeParse(date).success) return 'invalid-date';
  if (date < window.validity.from || date > window.validity.until) return 'outside-published-window';
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  if (window.status === 'conflicting-window') return 'conflicting-source-rows';
  return window.weekdaysISO.includes(weekday) ? 'listed' : 'not-listed-weekday';
}

export function caaScheduleDateState(association: CaaWeeklyScheduleAssociation, date: string): CaaScheduleDateState {
  const states = association.weeklyWindows.map(window => caaScheduleWindowDateState(window, date));
  if (states.includes('listed')) return 'listed';
  if (states.includes('conflicting-source-rows')) return 'conflicting-source-rows';
  if (states.includes('not-listed-weekday')) return 'not-listed-weekday';
  return states.includes('invalid-date') ? 'invalid-date' : 'outside-published-window';
}
