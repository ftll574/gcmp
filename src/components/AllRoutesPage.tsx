import { useEffect, useMemo, useState } from 'react';
import { buildAirportIndex } from '../lib/airport-index.ts';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { RouteLibraryEntitySelection } from '../lib/rtw/route-library-entities.ts';
import type { LoadedData } from '../state/use-loaded-data.ts';
import { RouteCatalogBrowser } from './RouteCatalogBrowser.tsx';
import { RouteLibraryExplorer } from './RouteLibraryExplorer.tsx';
import { SiteHeader, type SiteView } from './SiteHeader.tsx';
import { useLocale } from '../i18n/use-locale.ts';

type AllianceFilter = 'all' | 'star' | 'oneworld' | 'skyteam';

interface Props {
  readonly data: LoadedData;
  readonly onNavigate: (view: SiteView) => void;
  readonly onPlanRoute: (route: { from: string; to: string; carrier: string; flightNumber?: string | undefined }) => void;
}

function selectionFromLocation(): RouteLibraryEntitySelection | null {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('entity');
  const rawId = params.get('id')?.toUpperCase() ?? '';
  if (kind === 'airport' && /^[A-Z]{3}$/.test(rawId)) return { kind, id: rawId };
  if (kind === 'airline' && /^[A-Z0-9]{2,3}$/.test(rawId)) return { kind, id: rawId };
  if (kind === 'route' && /^[A-Z]{3}-[A-Z]{3}$/.test(rawId)) return { kind, id: rawId };
  return null;
}

export function AllRoutesPage({ data, onNavigate, onPlanRoute }: Props): React.ReactElement {
  const { locale } = useLocale();
  const copy = locale === 'zh-TW' ? {
    eyebrow: 'GCMP ROUTE LIBRARY', title: '不要翻資料庫，直接探索航網。',
    intro: '搜尋一個機場、航空公司、航線或班號，先進入它自己的資料頁，再一路查到班號與來源證據。',
    published: '目前顯示的 published routes', all: '全部聯盟', loading: '正在載入完整航線資料庫…', error: '航線資料載入失敗',
    advanced: '進階 evidence 瀏覽器', advancedBody: '需要以出發地、抵達地、區域與完整 evidence tree 查資料時再打開。', closeAdvanced: '收起進階瀏覽器',
    footer: '航線證據會隨時間變動。開票前請再次確認日期與實際營運航空公司。',
  } : {
    eyebrow: 'GCMP ROUTE LIBRARY', title: 'Explore the network. Don’t browse a database.',
    intro: 'Search an airport, airline, route or flight number, enter its own entity page, and drill down to flight-number and source evidence from there.',
    published: 'published routes shown', all: 'All alliances', loading: 'Loading the complete route library…', error: 'Route library failed to load',
    advanced: 'Advanced evidence browser', advancedBody: 'Open this only when you need the full origin/destination, geography, and evidence tree.', closeAdvanced: 'Close advanced browser',
    footer: 'Route evidence changes over time. Always recheck date and operating carrier before ticketing.',
  };
  const [network, setNetwork] = useState<RouteNetworkCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alliance, setAlliance] = useState<AllianceFilter>('all');
  const [selection, setSelection] = useState<RouteLibraryEntitySelection | null>(selectionFromLocation);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const airports = useMemo(() => buildAirportIndex(data.airports).byIata, [data.airports]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(data.routeNetworkRuntimeUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseRouteNetworkCatalog(await response.json(), new Set(airports.keys()));
      })
      .then(setNetwork)
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [data.routeNetworkRuntimeUrl, airports]);

  useEffect(() => {
    const sync = (): void => setSelection(selectionFromLocation());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const memberships = data.allianceCatalog.memberships.filter((membership) => membership.status === 'member');
  const memberCodes = useMemo(() => new Set(
    memberships
      .filter((membership) => alliance === 'all' || membership.alliance === alliance)
      .map((membership) => membership.airline),
  ), [memberships, alliance]);
  const carrierNames = useMemo(() => new Map(memberships.map((membership) => [membership.airline, membership.airlineName] as const)), [memberships]);
  const published = network?.routes.filter((route) => route.status === 'published' && memberCodes.has(route.carrier)).length ?? 0;

  const selectEntity = (next: RouteLibraryEntitySelection | null): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'routes');
    if (next) {
      url.searchParams.set('entity', next.kind);
      url.searchParams.set('id', next.id);
    } else {
      url.searchParams.delete('entity');
      url.searchParams.delete('id');
    }
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setSelection(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="site-page routes-page">
      <SiteHeader active="routes" onNavigate={onNavigate} />
      <main className="routes-page-main">
        <section className="routes-page-intro">
          <span className="landing-eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          <div className="routes-page-metrics"><strong>{published.toLocaleString()}</strong><span>{copy.published}</span></div>
        </section>

        <div className="routes-alliance-tabs" role="group" aria-label="Alliance filter">
          {(['all', 'star', 'oneworld', 'skyteam'] as const).map((value) => (
            <button key={value} type="button" className={alliance === value ? 'active' : ''} onClick={() => { setAlliance(value); selectEntity(null); }}>
              {value === 'all' ? copy.all : value === 'star' ? 'Star Alliance' : value === 'oneworld' ? 'oneworld' : 'SkyTeam'}
            </button>
          ))}
        </div>

        {!network && !error && <div className="routes-loading routes-loading-hero" role="status">{copy.loading}</div>}
        {error && <div className="routes-error" role="alert">{copy.error}: {error}</div>}
        {network && (
          <>
            <RouteLibraryExplorer
              network={network}
              airports={airports}
              carrierNames={carrierNames}
              memberCodes={memberCodes}
              countryContinents={data.countryContinents}
              airportContinentOverrides={data.airportContinentOverrides}
              selection={selection}
              onSelect={selectEntity}
              onPlanRoute={onPlanRoute}
            />

            <section className="routes-advanced-shell">
              <button type="button" className="routes-advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)}>
                <span>{advancedOpen ? copy.closeAdvanced : copy.advanced}</span><small>{copy.advancedBody}</small>
              </button>
              {advancedOpen && <section className="routes-browser-shell">
                <RouteCatalogBrowser
                  routeNetwork={network}
                  schedules={data.schedules}
                  officialSchedules={data.officialSchedules}
                  memberCodes={memberCodes}
                  airports={airports}
                  countryContinents={data.countryContinents}
                  countrySubregions={data.countrySubregions}
                  airportBrowseRegions={data.airportBrowseRegions}
                  airportContinentOverrides={data.airportContinentOverrides}
                  carrierNames={carrierNames}
                />
              </section>}
            </section>
          </>
        )}
      </main>
      <footer className="site-footer"><strong>gcmp</strong><span>{copy.footer}</span></footer>
    </div>
  );
}
