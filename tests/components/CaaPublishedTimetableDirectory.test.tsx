import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { CaaPublishedTimetableDirectory } from '../../src/components/CaaPublishedTimetableDirectory.tsx';
import { RouteLibraryExplorer } from '../../src/components/RouteLibraryExplorer.tsx';
import { parseRouteNetworkCatalog } from '../../src/lib/schemas/route-network.ts';
import { buildAirportIndex } from '../../src/lib/airport-index.ts';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
test('CAA directory loads only when opened and links to read-only domestic references',async()=>{
 const fetch=vi.fn(async()=>new Response(readFileSync('public/data/published-timetables/caa/index.json','utf8')));vi.stubGlobal('fetch',fetch);render(<CaaPublishedTimetableDirectory/>);expect(fetch).not.toHaveBeenCalled();const details=document.querySelector<HTMLDetailsElement>('[data-caa-directory]')!;details.open=true;fireEvent(details,new Event('toggle'));await waitFor(()=>expect(screen.getByText(/306 個既有航空公司方向/)).toBeInTheDocument());fireEvent.change(document.querySelector('[data-caa-directory-search]')!,{target:{value:'TSA-KNH'}});expect(screen.getByRole('link',{name:'TSA → KNH'})).toHaveAttribute('href','/?view=routes&entity=route&id=TSA-KNH');expect(document.querySelectorAll('[data-caa-directory] a')).toHaveLength(1);expect(document.querySelectorAll('button')).toHaveLength(0);
});
test('non-member primary references are visible independently without eligible route cards or planner callbacks',async()=>{
 const network=parseRouteNetworkCatalog(read('public/data/route-network/runtime-current.json'));const airports=buildAirportIndex(read('public/data/airports.json')).byIata;
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(readFileSync('public/data/published-timetables/caa/TSA-KNH.json','utf8'))));const onPlanRoute=vi.fn();
 render(<RouteLibraryExplorer network={network} airports={airports} carrierNames={new Map()} memberCodes={new Set(['NH'])} selection={{kind:'route',id:'TSA-KNH'}} onSelect={vi.fn()} onPlanRoute={onPlanRoute} alliance="star" onAllianceChange={vi.fn()} query="" onQueryChange={vi.fn()}/>);
 await waitFor(()=>expect(document.querySelector('[data-caa-carrier="B7"]')).toBeInTheDocument());expect(document.querySelector('[data-caa-carrier="AE"]')).toBeInTheDocument();expect(document.querySelectorAll('.route-carrier-card,.route-carrier-actions button')).toHaveLength(0);
 fireEvent.click(document.querySelector('[data-caa-carrier="B7"] .caa-published-timetable-evidence > summary')!);fireEvent.change(document.querySelector('[data-caa-carrier="B7"] [data-caa-reference-date]')!,{target:{value:'2026-10-26'}});expect(onPlanRoute).not.toHaveBeenCalled();
});
