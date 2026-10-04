import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {parseRouteNetworkCatalog,RouteNetworkCatalogSchema} from '../../src/lib/schemas/route-network.ts';
import {carrierEntityLabel,carrierRouteKey,carrierShardName} from '../../src/lib/carrier-identity.ts';

const airports=new Set((JSON.parse(readFileSync('public/data/airports.json','utf8')) as {iata:string}[]).map(x=>x.iata));
const runtime=parseRouteNetworkCatalog(JSON.parse(readFileSync('public/data/route-network/runtime-current.json','utf8')),airports);

it('keeps the six approved route-only directions source-backed and free of schedule or operation promotion',()=>{
 const rows=runtime.routes.filter(row=>row.routeEvidenceScope==='route-only');
 expect(rows.map(row=>carrierRouteKey(row,...row.pair)).sort()).toEqual(['BR+ACN+azul-conecta-ltda:CNF-DTI','BR+ACN+azul-conecta-ltda:CNF-JDR','BR+ACN+azul-conecta-ltda:DTI-CNF','BR+ACN+azul-conecta-ltda:JDR-CNF','H8:GRU-LIM','H8:LIM-GRU']);
 for(const row of rows){expect(row.status).toBe('published');expect(row.carrierIdentity).toBe('provider-listed');expect(row.routeEvidence).toBe('official-directed');expect(row.flightNumbers).toBeUndefined();expect(row.flightNumberCandidates).toBeUndefined();expect(row.registeredPlans).toBeUndefined();expect(row.effectiveFrom).toBeUndefined();expect(row.effectiveUntil).toBeUndefined();}
 const acn=rows.filter(row=>row.carrierEntityKey);expect(acn).toHaveLength(4);expect(acn.every(row=>row.carrier==='2F'&&row.carrierEntityKey==='BR+ACN+azul-conecta-ltda')).toBe(true);expect(acn.map(row=>carrierEntityLabel(row))).toEqual(Array(4).fill('2F · Azul Conecta Ltda.'));
 expect(carrierShardName(acn[0]!)).toBe('BR%2BACN%2Bazul-conecta-ltda');expect(runtime.routes.some(row=>row.carrier==='AD'&&row.carrierEntityKey==='BR+ACN+azul-conecta-ltda')).toBe(false);
 expect(()=>RouteNetworkCatalogSchema.parse({...runtime,routes:runtime.routes.map(row=>row.routeEvidenceScope==='route-only'?{...row,flightNumbers:[`${row.carrier}123`]}:row)})).toThrow('Route-only evidence must remain');
});

it('serializes H8 and Azul Conecta into independent valid carrier shards',()=>{
 const manifest=JSON.parse(readFileSync('public/data/route-network/runtime-carriers.meta.json','utf8')) as {carriers:Record<string,{routes:number}>};
 expect(manifest.carriers.H8?.routes).toBe(2);expect(manifest.carriers['BR+ACN+azul-conecta-ltda']?.routes).toBe(4);
 const acn=parseRouteNetworkCatalog(JSON.parse(readFileSync('public/data/route-network/runtime-carriers/BR%2BACN%2Bazul-conecta-ltda.json','utf8')),airports);
 expect(acn.routes.map(row=>carrierRouteKey(row,...row.pair)).sort()).toEqual(['BR+ACN+azul-conecta-ltda:CNF-DTI','BR+ACN+azul-conecta-ltda:CNF-JDR','BR+ACN+azul-conecta-ltda:DTI-CNF','BR+ACN+azul-conecta-ltda:JDR-CNF']);
});

it('reconstructs the accepted legacy runtime bytes after removing only this six-route batch and its sources',()=>{
 const routeOnlyIds=new Set(runtime.routes.filter(row=>row.routeEvidenceScope==='route-only').flatMap(row=>row.sourceIds));
 const legacy={...runtime,routes:runtime.routes.filter(row=>row.routeEvidenceScope!=='route-only'),sources:runtime.sources.filter(row=>!routeOnlyIds.has(row.id))};
 const sha=createHash('sha256').update(`${JSON.stringify(legacy)}\n`).digest('hex');
 expect(legacy.routes).toHaveLength(31652);expect(sha).toBe('94cfdb6ffe3ede154875be6b8e742b3191fed508496f331252b628e2e80235ef');
 expect(legacy.routes.filter(row=>row.carrier==='AD')).toHaveLength(49);expect(legacy.routes.some(row=>row.carrier==='2F')).toBe(false);
});
