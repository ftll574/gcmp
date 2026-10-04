import type {RouteNetworkEntry,RouteNetworkSource} from '../schemas/route-network.ts';
export type SourceReviewWindow=NonNullable<RouteNetworkSource['routeReviewWindow']>;
export type SourceReviewState='not-yet-reviewed'|'within-review'|'review-due';
/** Only a marked primary generator source and its exact original bounds qualify.
 * Other dates retain their existing service constraints; no period is extended. */
export function routeSourceReviewWindow(route:RouteNetworkEntry,sources:ReadonlyMap<string,RouteNetworkSource>):SourceReviewWindow|null {
 const window=sources.get(route.sourceIds[0]!)?.routeReviewWindow;
 return route.carrierIdentity==='provider-listed' && route.status!=='suspended' && window
  && route.effectiveFrom===window.from && route.effectiveUntil===window.until ? window:null;
}
/** Relationship discovery only. Passing unknown service bounds never confirms a flight. */
export function routeWithinExplicitServiceWindow(route:RouteNetworkEntry,date:string,sources:ReadonlyMap<string,RouteNetworkSource>):boolean {
 return routeSourceReviewWindow(route,sources)!==null || ((!route.effectiveFrom || date>=route.effectiveFrom)&&(!route.effectiveUntil || date<=route.effectiveUntil));
}
/** Freshness is assessed against the evidence clock, never the requested flight date. */
export function sourceReviewState(window:SourceReviewWindow,evidenceNow:number=Date.now()):SourceReviewState {
 if(!Number.isFinite(evidenceNow))return 'review-due';
 const today=new Date(evidenceNow).toISOString().slice(0,10);
 return today<window.from?'not-yet-reviewed':today>window.until?'review-due':'within-review';
}
export function sourceReviewStatusLabel(state:SourceReviewState,zh:boolean):string {
 if(state==='review-due')return zh?'來源需覆核，並非停飛證據':'Source review due; this is not suspension evidence';
 if(state==='not-yet-reviewed')return zh?'尚未到來源覆核日':'Source review date has not arrived';
 return zh?'來源覆核窗內；日期班表仍未知':'Within source review window; dated schedule remains unknown';
}
