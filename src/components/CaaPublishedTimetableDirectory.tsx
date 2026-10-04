import { useEffect, useState } from 'react';
import { CaaPublishedTimetableIndexSchema } from '../lib/schemas/caa-published-timetables.ts';
import { siteAssetHref, siteRouteEntityHref } from '../lib/site-navigation.ts';
import type { z } from 'zod';
/** Discovery links only, never planner selections or route-graph additions. */
export function CaaPublishedTimetableDirectory():React.ReactElement {
  const [open,setOpen]=useState(false);
  const [index,setIndex]=useState<z.infer<typeof CaaPublishedTimetableIndexSchema>|null>(null);
  const [failed,setFailed]=useState(false);
  const [query,setQuery]=useState('');
  useEffect(()=>{
    if(!open||index)return;
    const controller=new AbortController();
    void fetch(siteAssetHref('data/published-timetables/caa/index.json'),{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('CAA directory unavailable');const parsed=CaaPublishedTimetableIndexSchema.parse(await response.json());if(!controller.signal.aborted)setIndex(parsed);}).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
    return ()=>controller.abort();
  },[open,index]);
  return <section className="route-evidence-panel"><h2>臺灣 CAA 發布時刻參考</h2><p>查閱既有方向的民航局時刻參考。非聯盟會員的列示也可唯讀查看，不代表實際營運、直飛、可訂位或環球票可用。</p>
    <details data-caa-directory onToggle={event=>setOpen(event.currentTarget.open)}><summary>查看方向與來源時刻</summary>
      {open&&!index&&!failed&&<p role="status">讀取 CAA 參考目錄…</p>}{failed&&<p role="status">CAA 參考目錄暫無法讀取。</p>}
      {index&&<><p>{index.primaryCarrierDirections} 個既有航空公司方向可查看參考；來源日曆快照 {index.asOfSourceCalendarDate}。</p><label>搜尋 IATA 或列示航空公司 <input data-caa-directory-search value={query} onChange={event=>setQuery(event.target.value)}/></label><ul>{index.pairs.filter(item=>[item.pair.join('-'),...item.pair,...item.listedCarriers].some(code=>code.includes(query.trim().toUpperCase()))).map(item=><li key={item.pair.join('-')}><a href={siteRouteEntityHref(item.pair.join('-'))}>{item.pair.join(' → ')}</a> · {item.listedCarriers.join(', ')}</li>)}</ul></>}
    </details>
  </section>;
}
