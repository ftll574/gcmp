/** Offline CAA references on existing published primary-carrier directions only.
 * No runtime route/status/operator/number/schedule mutation and no source fetch. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCaaFiles, type CaaPolicy } from './lib/open-data-caa.ts';
import type { OpenSnapshot } from '../src/lib/open-data-package.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';
import { routeSourceReviewWindow } from '../src/lib/rtw/route-date-semantics.ts';
import { CaaPublishedTimetableIndexSchema, CaaPublishedTimetableShardSchema } from '../src/lib/schemas/caa-published-timetables.ts';

export function buildCaaPublishedReferences(root: string) {
  const read=(path:string)=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
  const policy=read('scripts/data/open-data/caa/policy.json') as CaaPolicy;
  const airports=read('scripts/data/open-data/ourairports-20261001.json') as OpenSnapshot;
  const batch=buildCaaFiles(policy,policy.sources.map(source=>readFileSync(resolve(root,source.snapshotPath),'utf8')),airports);
  if(readFileSync(resolve(root,'artifacts/open-data-package/caa-scheduled-endpoint-records.json'),'utf8')!==batch.text)throw Error('Saved qualified CAA package is not the pinned independent reproduction');
  const runtime=parseRouteNetworkCatalog(read('public/data/route-network/runtime-current.json'));
  const routes=new Map(runtime.routes.filter(route=>route.status==='published').map(route=>[`${route.carrier}:${route.pair.join('-')}`,route]));
  const routeSources=new Map(runtime.sources.map(source=>[source.id,source]));
  const weekly=read('public/data/schedules/current.json').entries as {carrier:string;pair:string[];effectiveFrom?:string;effectiveUntil?:string;daysOfWeek:number[]}[];
  const official=read('public/data/official-schedules.json').services as {carrier:string;from:string;to:string;effectiveFrom:string;effectiveUntil:string;departureTime?:string;arrivalTime?:string}[];
  const sourceView=(src:CaaPolicy['sources'][number])=>({id:src.id,datasetId:src.datasetId,datasetUrl:src.datasetUrl,resourceUrl:src.resourceUrl,snapshotSHA256:src.snapshotSHA256,retrievedAt:src.retrievedAt,provider:src.provider,title:src.title,attribution:src.attribution,license:src.license,licenseUrl:src.licenseUrl});
  const sourceById=new Map(policy.sources.map(source=>[source.id,source]));
  const keyOf=(row:(typeof batch.records)[number])=>`${row.listedAirlineCode}:${row.from}-${row.to}`;
  const primaryKeys=[...new Set(batch.records.map(keyOf))].sort();
  const matched=batch.records.filter(row=>routes.has(keyOf(row)));
  const held=batch.records.filter(row=>!routes.has(keyOf(row)));
  const groups=new Map<string,typeof matched>();
  for(const row of matched){const pair=`${row.from}-${row.to}`;groups.set(pair,[...(groups.get(pair)??[]),row]);}
  const files:Record<string,string>={};
  for(const [pair,records] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
    const sourceIds=[...new Set(records.map(row=>row.provenance.sourceId))];
    const sources=sourceIds.map(id=>sourceView(sourceById.get(id)!));
    const shard=CaaPublishedTimetableShardSchema.parse({version:1,kind:'caa-published-timetable-references',pair:pair.split('-'),asOfSourceCalendarDate:policy.asOfSourceCalendarDate,selectable:false,sources,records});
    files[`${pair}.json`]=JSON.stringify(shard)+'\n';
  }
  const directions=primaryKeys.filter(key=>routes.has(key)).map(key=>{
    const route=routes.get(key)!;const records=matched.filter(row=>keyOf(row)===key);const scheduleRows=weekly.filter(row=>`${row.carrier}:${row.pair.join('-')}`===key);const officialRows=official.filter(row=>`${row.carrier}:${row.from}-${row.to}`===key);
    return {key,referenceIds:records.map(row=>row.id),sourceReferenceRecords:records.length,listedOnSourceCalendarDate:records.some(row=>row.matchingSourceCalendarDates.includes(policy.asOfSourceCalendarDate)),before:{explicitRouteServiceBounds:Boolean(route.effectiveFrom&&route.effectiveUntil&&!routeSourceReviewWindow(route,routeSources)),generatedReviewWindow:Boolean(routeSourceReviewWindow(route,routeSources)),weeklyScheduleRows:scheduleRows.length,officialDatedServiceRows:officialRows.length,existingClockReferenceRows:(route.registeredPlans?.length??0)+officialRows.filter(row=>row.departureTime||row.arrivalTime).length,runtimeCAAPlanField:false},addedFields:['source-calendar-intervals','inferred-source-weekdays','raw-source-clocks-and-explicit-day-suffixes','source-row-hash-lineage','primary-listing-and-alias-relationships'],selectableServicesAdded:0};
  });
  const aliasRelationships=batch.records.flatMap(row=>row.codeShareAliases.map(alias=>({recordId:row.id,alias,key:`${alias.slice(0,2)}:${row.from}-${row.to}`,decision:'relationship-only-no-service-expansion'})));
  const progress={qualifiedRecords:batch.records.length,qualifiedHeldRows:batch.held.length,sourcePrimaryDirectionKeys:primaryKeys.length,existingPrimaryDirectionsStrengthened:directions.length,referenceRecordsExposed:matched.length,pairShards:Object.keys(files).length,sourceDateMatchingDirections:directions.filter(row=>row.listedOnSourceCalendarDate).length,noSourceDateMatchingDirections:directions.filter(row=>!row.listedOnSourceCalendarDate).length,missingPrimaryDirectionKeys:primaryKeys.filter(key=>!routes.has(key)).length,missingPrimaryReferenceRecords:held.length,aliasRelationshipCount:aliasRelationships.length,aliasDirectionKeysExcludedFromExpansion:new Set(aliasRelationships.map(row=>row.key)).size,aliasServicesCreated:0,newCurrentDirections:0,statusUpgrades:0,newSelectableSchedules:0};
  const index=CaaPublishedTimetableIndexSchema.parse({version:1,kind:'caa-published-timetable-reference-index',sources:policy.sources.map(sourceView),selectable:false,asOfSourceCalendarDate:policy.asOfSourceCalendarDate,primaryCarrierDirections:directions.length,pairs:[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([pair,records])=>({pair:pair.split('-'),listedCarriers:[...new Set(records.map(row=>row.listedAirlineCode))].sort()}))});
  return {files,indexText:JSON.stringify(index)+'\n',progress,directions,heldDirections:primaryKeys.filter(key=>!routes.has(key)).map(key=>({key,referenceIds:held.filter(row=>keyOf(row)===key).map(row=>row.id),reason:'No existing published primary-carrier direction; source endpoints and unreported transit alone do not confirm nonstop/operator. No graph import.'})),aliasRelationships,sourceHashes:policy.sources.map(source=>({id:source.id,sha256:source.snapshotSHA256})),runtimeSHA256:createHash('sha256').update(readFileSync(resolve(root,'public/data/route-network/runtime-current.json'))).digest('hex')};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
  const result=buildCaaPublishedReferences(process.cwd());const output='public/data/published-timetables/caa';mkdirSync(output,{recursive:true});
  for(const [name,text] of Object.entries(result.files))writeFileSync(`${output}/${name}`,text);
  writeFileSync(`${output}/index.json`,result.indexText);
  const report='docs/coverage-ledger/caa-published-timetables-20261002';mkdirSync(report,{recursive:true});
  const {files,indexText,...comparison}=result;void files;void indexText;writeFileSync(`${report}/comparison.json`,JSON.stringify(comparison,null,2)+'\n');console.log(JSON.stringify(result.progress));
}
