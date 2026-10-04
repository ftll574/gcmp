import { z } from 'zod';
const date = z.iso.date();
const clock = z.object({
  raw: z.string().regex(/^\d{4}(?:\+[0-9])?$/), clock: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  explicitDayOffsetSuffix: z.string().regex(/^\+[0-9]$/).nullable(), dayOffsetDays: z.number().int().min(0).max(9).nullable(),
  timezone: z.literal('not-defined-by-source'), qualification: z.literal('source clock/day marker; no UTC instant or absent-suffix day alignment inferred'),
}).strict().refine(value => value.raw.slice(0, 2) + ':' + value.raw.slice(2, 4) === value.clock && (value.raw.slice(4) || null) === value.explicitDayOffsetSuffix && value.dayOffsetDays === (value.explicitDayOffsetSuffix ? Number(value.explicitDayOffsetSuffix.slice(1)) : null), 'Clock/raw suffix mismatch');
const source = z.object({
  id: z.string(), datasetId: z.enum(['9973', '6066']), datasetUrl: z.string().url(), resourceUrl: z.string().url(), snapshotSHA256: z.string(),
  retrievedAt: z.string(), provider: z.literal('交通部民用航空局'), title: z.string(), attribution: z.string().min(1),
  license: z.literal('OGDL-Taiwan-1.0'), licenseUrl: z.literal('https://data.gov.tw/license'),
}).strict().superRefine((value, ctx) => {
  const resource = value.datasetId === '9973' ? '16679' : '16680';
  const pin = value.datasetId === '9973' ? 'ebfd2e8f207a46f250fe48c53b53770d10a1fec342a18a73e19f349574bb0f35' : '5690304d65a8a0a62df920d8cf16227654674b34fff2a44f064f79d587286ea2';
  if (value.id !== `caa-ogdl-${value.datasetId}-20261001` || value.datasetUrl !== `https://data.gov.tw/dataset/${value.datasetId}` || value.resourceUrl !== `https://www.caa.gov.tw/FileAtt.ashx?id=${resource}&lang=1` || value.snapshotSHA256 !== pin || ![value.provider, '2026', resource, value.licenseUrl].every(part => value.attribution.includes(part))) ctx.addIssue({code:'custom',message:'Unknown CAA source/pin/attribution'});
});
const record = z.object({
  id: z.string().regex(/^caa-(9973|6066)-\d+$/), evidenceTier: z.literal('source-listed-scheduled-endpoints'),
  from: z.string().regex(/^[A-Z]{3}$/), to: z.string().regex(/^[A-Z]{3}$/), listedAirlineCode: z.string().regex(/^[A-Z0-9]{2}$/), listedFlightDesignator: z.string().regex(/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/),
  codeShareInfoRaw: z.string(), codeShareAliases: z.array(z.string().regex(/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/)), carrierRole: z.literal('source-listed; physical operating/marketing role not established'), operatingCarrier: z.null(), marketingCarrier: z.null(),
  validity: z.object({start:date,end:date}).strict(), sourceWeekdayPattern: z.string().regex(/^[01][02][03][04][05][06][07]$/), inferredIsoWeekdays: z.array(z.number().int().min(1).max(7)).min(1), matchingSourceCalendarDates: z.array(date).min(1),
  departureClock: clock, arrivalClock: clock,
  transitReporting: z.literal('no-transit-reported'), reportedTransit: z.array(z.never()).length(0), nonstop: z.literal('not-confirmed'),
  passengerRelevance: z.literal('source-declared-passenger-scheduled-scope; not individually operation-verified'), actualOperationConfirmed: z.literal(false), cancellationStatus: z.literal('unknown'), bookable: z.literal(false), selectableOperatingService: z.literal(false),
  flagRaw: z.literal(''), aircraftTypeRaw: z.string(), secondaryAircraftTypesRaw: z.array(z.string()).length(5),
  airportProvenance: z.object({sourceId:z.literal('ourairports-public-domain-20261001'),rawSHA256:z.literal('7a3fe6ee4a451469cb3197d43ad71838b587dc4bca8bef98728d779d2a475722'),rowIds:z.array(z.string()).min(2)}).strict(),
  provenance: z.object({sourceId:z.string(),snapshotSHA256:z.string(),csvRowNumbers:z.array(z.number().int().min(2)).min(1),transform:z.literal('caa-scheduled-endpoints-v1')}).strict(),
}).strict().superRefine((value, ctx) => {
  const days = [...value.sourceWeekdayPattern].flatMap((day,index)=>day==='0'?[]:[index+1]);
  const aliases = [...new Set(value.codeShareInfoRaw.split(';').map(alias=>alias.trim()).filter(Boolean))];
  if (value.from===value.to || !value.listedFlightDesignator.startsWith(value.listedAirlineCode) || JSON.stringify(days)!==JSON.stringify(value.inferredIsoWeekdays) || JSON.stringify(aliases)!==JSON.stringify(value.codeShareAliases) || aliases.includes(value.listedFlightDesignator) || value.validity.start>value.validity.end) ctx.addIssue({code:'custom',message:'CAA identity/weekday/alias/interval mismatch'});
  const dates=value.matchingSourceCalendarDates;
  if (new Set(dates).size!==dates.length || dates.some(day=>day<'2026-10-02'||day<value.validity.start||day>value.validity.end||!days.includes(new Date(`${day}T00:00:00Z`).getUTCDay()||7))) ctx.addIssue({code:'custom',message:'Unsupported source calendar dates'});
});
export const CaaPublishedTimetableShardSchema = z.object({
  version: z.literal(1), kind: z.literal('caa-published-timetable-references'), pair:z.tuple([z.string(),z.string()]),
  asOfSourceCalendarDate:z.literal('2026-10-02'), selectable:z.literal(false), sources:z.array(source).min(1).max(2), records:z.array(record).min(1),
}).strict().superRefine((value,ctx)=>{
  const sources=new Map(value.sources.map(item=>[item.id,item]));const ids=new Set<string>();
  for(const item of value.records){const src=sources.get(item.provenance.sourceId);if(item.from!==value.pair[0]||item.to!==value.pair[1]||!src||src.snapshotSHA256!==item.provenance.snapshotSHA256||ids.has(item.id)||item.id!==`caa-${src.datasetId}-${item.provenance.csvRowNumbers[0]}`)ctx.addIssue({code:'custom',message:'CAA direction/source/record lineage mismatch'});ids.add(item.id);}
});
export type CaaPublishedTimetableShard=z.infer<typeof CaaPublishedTimetableShardSchema>;
export type CaaPublishedReference=CaaPublishedTimetableShard['records'][number];
export function caaReferenceMatchesDate(record:CaaPublishedReference,day:string):boolean {
  return day>=record.validity.start&&day<=record.validity.end&&record.matchingSourceCalendarDates.includes(day);
}
export function caaReferenceCalendarState(record:CaaPublishedReference,day:string):'listed-date'|'future-source-dates'|'past-source-dates'|'not-listed-date' {
  if(caaReferenceMatchesDate(record,day))return 'listed-date';
  if(day<record.matchingSourceCalendarDates[0]!)return 'future-source-dates';
  if(day>record.matchingSourceCalendarDates.at(-1)!)return 'past-source-dates';
  return 'not-listed-date';
}

export const CaaPublishedTimetableIndexSchema=z.object({version:z.literal(1),kind:z.literal('caa-published-timetable-reference-index'),sources:z.array(source).min(1).max(2),selectable:z.literal(false),asOfSourceCalendarDate:z.literal('2026-10-02'),primaryCarrierDirections:z.number().int().positive(),pairs:z.array(z.object({pair:z.tuple([z.string().regex(/^[A-Z]{3}$/),z.string().regex(/^[A-Z]{3}$/)]),listedCarriers:z.array(z.string().regex(/^[A-Z0-9]{2}$/)).min(1)}).strict()).min(1)}).strict().refine(value=>new Set(value.pairs.map(item=>item.pair.join('-'))).size===value.pairs.length&&value.pairs.every(item=>new Set(item.listedCarriers).size===item.listedCarriers.length)&&value.pairs.reduce((sum,item)=>sum+item.listedCarriers.length,0)===value.primaryCarrierDirections,'CAA directory direction counts mismatch');
