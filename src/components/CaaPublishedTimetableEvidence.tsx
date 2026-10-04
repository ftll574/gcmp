import { useMemo, useState } from 'react';
import { sameAirport } from '../lib/airport-identity.ts';
import { caaReferenceCalendarState, caaReferenceMatchesDate, type CaaPublishedTimetableShard } from '../lib/schemas/caa-published-timetables.ts';
interface Props { readonly shard:CaaPublishedTimetableShard;readonly carrier:string;readonly from:string;readonly to:string;readonly zh:boolean; }
const daysEn=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];const daysZh=['一','二','三','四','五','六','日'];
/** Published endpoint timetables, never SIROS registrations or selectable flights. */
export function CaaPublishedTimetableEvidence({shard,carrier,from,to,zh}:Props):React.ReactElement|null {
  const records=useMemo(()=>shard.records.filter(row=>row.listedAirlineCode===carrier&&sameAirport(row.from,from)&&sameAirport(row.to,to)),[shard,carrier,from,to]);
  const [date,setDate]=useState(shard.asOfSourceCalendarDate as string);
  const [matchingOnly,setMatchingOnly]=useState(false);
  const [visibleCount,setVisibleCount]=useState(8);
  if(records.length===0)return null;
  const filtered=matchingOnly?records.filter(row=>caaReferenceMatchesDate(row,date)):records;
  const labels=zh?{'listed-date':'來源當日有列示','future-source-dates':'尚未到本筆來源日期','past-source-dates':'本筆來源日期已過','not-listed-date':'來源當日未列示'}:{'listed-date':'Listed on this source-calendar date','future-source-dates':'Future source-calendar dates','past-source-dates':'Past source-calendar dates','not-listed-date':'Not listed on this source-calendar date'};
  return <details className="caa-published-timetable-evidence">
    <summary>{zh?'CAA 發布時刻表（唯讀參考）':'CAA published timetable (read-only reference)'} · {records.length}</summary>
    <p>{zh?'以下是民航局列示的定期客運端點與時刻參考，不是 ANAC 登記計畫或可選班次。列示航空公司不等於已核實的實際營運者；空 transit 只表示未回報中停，不能據此確認直飛。':'These are CAA-listed scheduled-passenger endpoint/timetable references, not ANAC registrations or selectable services. Listed carriers are not verified physical operators. Empty transit fields mean no transit reported, not confirmed nonstop.'}</p>
    <p>{zh?'星期為來源欄位的位置推論。原始時刻的時區未由來源定義；只有明印的 +日 標記可讀取，無標記時到達日偏移未知。不能據此安排接續航班；實際飛行、取消、可訂位與環球票適用均未確認。':'Weekdays are inferred from the source pattern. Source clocks have no defined timezone. Only explicit +day markers are retained; absent markers leave arrival-day offset unknown. These clocks cannot establish connections; actual operation, cancellation, bookability and RTW eligibility are unconfirmed.'}</p>
    <p>{zh?'這個參考日不會更改行程日期或較強的既有班表。':'This reference date changes neither your itinerary nor stronger existing schedules.'}</p>
    <label>{zh?'來源日曆參考日（非選班）':'Source-calendar reference date (not flight selection)'} <input data-caa-reference-date type="date" value={date} onChange={event=>{if(/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)){setDate(event.target.value);setVisibleCount(8);}}}/></label>
    <label><input data-caa-matching-only type="checkbox" checked={matchingOnly} onChange={event=>{setMatchingOnly(event.target.checked);setVisibleCount(8);}}/>{zh?'只顯示來源當日有列示的紀錄':'Only records listed on that source-calendar date'}</label>
    <p>{filtered.length} {zh?'筆來源參考，不是航線或實際班次数':'source references, not routes or actual flight counts'}</p>
    <ul>{filtered.slice(0,visibleCount).map(row=><li key={row.id} data-caa-record={row.id}>
      <p><strong>{zh?'列示班號':'Listed designator'} {row.listedFlightDesignator}</strong> · {row.from} → {row.to} · {labels[caaReferenceCalendarState(row,date)]}</p>
      <p>{row.validity.start} → {row.validity.end} · {zh?'推論星期':'Inferred weekdays'} {row.inferredIsoWeekdays.map(day=>(zh?daysZh:daysEn)[day-1]).join(', ')} · {zh?'原始星期欄':'Raw weekday mask'} {row.sourceWeekdayPattern}</p>
      <p>{zh?'來源原始時刻（時區未定）':'Raw source clocks (timezone undefined)'} {row.departureClock.raw} → {row.arrivalClock.raw} · {row.arrivalClock.dayOffsetDays===null?(zh?'到達日偏移未知':'Arrival-day offset unknown'):(zh?`僅本筆明印到達日偏移 +${row.arrivalClock.dayOffsetDays}`:`Only this row explicitly marks arrival-day offset +${row.arrivalClock.dayOffsetDays}`)}</p>
      {row.codeShareInfoRaw&&<p>{zh?'共掛原文（不展開為服務）':'Codeshare text (no service expansion)'}: {row.codeShareInfoRaw}</p>}
      <details><summary>{zh?'來源日期與欄位追溯':'Source dates and field lineage'}</summary>
        <p>{zh?'本筆捕捉日起列示日期':'Listed dates from the captured as-of day'}: {row.matchingSourceCalendarDates.join(', ')}</p>
        <p>{row.id} · {zh?'CSV 原始列':'Original CSV rows'} {row.provenance.csvRowNumbers.join(', ')} · SHA256 {row.provenance.snapshotSHA256}</p>
        <p>{zh?'原始機型代碼':'Raw aircraft code'}: {row.aircraftTypeRaw} · {zh?'來源原始端點保留':'Original source endpoints retained'}</p>
      </details>
    </li>)}</ul>
    {filtered.length>visibleCount&&<button type="button" data-caa-show-more onClick={()=>setVisibleCount(count=>count+16)}>{zh?'顯示更多來源參考':'Show more source references'}</button>}
    <details><summary>{zh?'CAA 來源與 OGDL 顯名':'CAA sources and OGDL attribution'}</summary>{shard.sources.map(source=><div key={source.id}>
      <p>{source.attribution}</p><p>{zh?'擷取':'Captured'}: {source.retrievedAt}</p>
      <a href={source.resourceUrl} target="_blank" rel="noreferrer">{zh?'原始民航局時刻表':'Original CAA timetable'}</a> · <a href={source.datasetUrl} target="_blank" rel="noreferrer">{source.title}</a> · <a href={source.licenseUrl} target="_blank" rel="noreferrer">OGDL-Taiwan-1.0</a>
    </div>)}</details>
  </details>;
}
