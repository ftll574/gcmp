import { useEffect, useState } from 'react';
import { CaaPublishedTimetableShardSchema, type CaaPublishedTimetableShard } from './schemas/caa-published-timetables.ts';
import { siteAssetHref } from './site-navigation.ts';
const cache=new Map<string,CaaPublishedTimetableShard|null>();
type State={readonly url:string;readonly status:'ready';readonly shard:CaaPublishedTimetableShard}|{readonly url:string;readonly status:'missing'|'failed'};
/** Route-detail-only pair shards. This reference layer cannot change the graph. */
export function useCaaPublishedTimetables(pairKey:string|null):{readonly status:'idle'|'loading'|'ready'|'missing'|'failed';readonly shard:CaaPublishedTimetableShard|null} {
  const url=pairKey&&/^[A-Z]{3}-[A-Z]{3}$/.test(pairKey)?siteAssetHref(`data/published-timetables/caa/${pairKey}.json`):'';
  const [state,setState]=useState<State|null>(null);
  useEffect(()=>{
    if(!url||cache.has(url))return;
    const controller=new AbortController();
    void fetch(url,{signal:controller.signal}).then(async response=>{
      if(response.status===404){cache.set(url,null);setState({url,status:'missing'});return;}
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const shard=CaaPublishedTimetableShardSchema.parse(await response.json());
      if(shard.pair.join('-')!==pairKey)throw Error('CAA pair mismatch');
      cache.set(url,shard);setState({url,status:'ready',shard});
    }).catch(()=>{if(!controller.signal.aborted)setState({url,status:'failed'});});
    return ()=>controller.abort();
  },[url,pairKey]);
  if(!url)return {status:'idle',shard:null};
  if(cache.has(url)){const shard=cache.get(url)??null;return {status:shard?'ready':'missing',shard};}
  if(state?.url===url)return {status:state.status,shard:state.status==='ready'?state.shard:null};
  return {status:'loading',shard:null};
}
