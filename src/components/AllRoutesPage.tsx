import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { buildAirportIndex } from '../lib/airport-index.ts';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { RouteLibraryEntitySelection } from '../lib/rtw/route-library-entities.ts';
import type { LoadedData } from '../state/use-loaded-data.ts';
import { RouteLibraryExplorer } from './RouteLibraryExplorer.tsx';
import { SiteHeader, type SiteView } from './SiteHeader.tsx';
import { useLocale } from '../i18n/use-locale.ts';

type AllianceFilter = 'all' | 'star' | 'oneworld' | 'skyteam';

const LazyRouteCatalogBrowser = lazy(() =>
  import('./RouteCatalogBrowser.tsx').then((module) => ({ default: module.RouteCatalogBrowser })),
);

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

function allianceFromLocation(): AllianceFilter {
  const value = new URLSearchParams(window.location.search).get('alliance');
  return value === 'star' || value === 'oneworld' || value === 'skyteam' ? value : 'all';
}

function queryFromLocation(): string {
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

function advancedFromLocation(): boolean {
  return new URLSearchParams(window.location.search).get('advanced') === '1';
}

export function AllRoutesPage({ data, onNavigate, onPlanRoute }: Props): React.ReactElement {
  const { locale } = useLocale();
  const copy = locale === 'zh-TW' ? {
    eyebrow: '航線資料庫', title: '探索全球航網',
    intro: '從機場、城市、航空公司、航線或班號，直接進入目前收錄的航網資料。',
    all: '全部聯盟', loading: '正在載入航線資料…', error: '航線資料載入失敗', retry: '重新載入',
    advanced: '詳細篩選', advancedBody: '依出發地、抵達地、航空公司與區域篩選完整航線。', closeAdvanced: '收起詳細篩選',
    footer: '航線證據會隨時間變動。開票前請再次確認日期與實際營運航空公司。',
  } : {
    eyebrow: 'Route library', title: 'Explore the global route network',
    intro: 'Start from an airport, city, airline, route or flight number and move directly through the network in the current catalog.',
    all: 'All alliances', loading: 'Loading route data…', error: 'Route library failed to load', retry: 'Reload',
    advanced: 'Detailed filters', advancedBody: 'Filter the complete network by origin, destination, airline and region.', closeAdvanced: 'Close detailed filters',
    footer: 'Route evidence changes over time. Always recheck date and operating carrier before ticketing.',
  };
  const [network, setNetwork] = useState<RouteNetworkCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alliance, setAlliance] = useState<AllianceFilter>(allianceFromLocation);
  const [selection, setSelection] = useState<RouteLibraryEntitySelection | null>(selectionFromLocation);
  const [query, setQuery] = useState(queryFromLocation);
  const [advancedOpen, setAdvancedOpen] = useState(advancedFromLocation);
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
    const sync = (): void => {
      setSelection(selectionFromLocation());
      setAlliance(allianceFromLocation());
      setQuery(queryFromLocation());
      setAdvancedOpen(advancedFromLocation());
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const replaceUiState = (next: { alliance?: AllianceFilter; query?: string; advanced?: boolean }): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'routes');
    if (next.alliance !== undefined) {
      if (next.alliance === 'all') url.searchParams.delete('alliance');
      else url.searchParams.set('alliance', next.alliance);
    }
    if (next.query !== undefined) {
      if (next.query.trim() === '') url.searchParams.delete('q');
      else url.searchParams.set('q', next.query);
    }
    if (next.advanced !== undefined) {
      if (next.advanced) url.searchParams.set('advanced', '1');
      else url.searchParams.delete('advanced');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const changeAlliance = (value: AllianceFilter): void => {
    setAlliance(value);
    replaceUiState({ alliance: value });
  };

  const changeQuery = (value: string): void => {
    setQuery(value);
    replaceUiState({ query: value });
  };

  const memberships = data.allianceCatalog.memberships.filter((membership) => membership.status === 'member');
  const memberCodes = useMemo(() => new Set(
    memberships
      .filter((membership) => alliance === 'all' || membership.alliance === alliance)
      .map((membership) => membership.airline),
  ), [memberships, alliance]);
  const carrierNames = useMemo(() => new Map(memberships.map((membership) => [membership.airline, membership.airlineName] as const)), [memberships]);
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
      <main id="main-content" className="routes-page-main">
        <section className="routes-page-intro">
          <span className="routes-page-kicker">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </section>

        {!network && !error && <div className="routes-loading routes-loading-hero" role="status">{copy.loading}</div>}
        {error && <div className="routes-error" role="alert"><strong>{copy.error}</strong><span>{error}</span><button type="button" onClick={() => window.location.reload()}>{copy.retry}</button></div>}
        {network && (
          <>
            <RouteLibraryExplorer
              network={network}
              airports={airports}
              carrierNames={carrierNames}
              memberCodes={memberCodes}
              alliance={alliance}
              onAllianceChange={changeAlliance}
              query={query}
              onQueryChange={changeQuery}
              countryContinents={data.countryContinents}
              airportContinentOverrides={data.airportContinentOverrides}
              selection={selection}
              onSelect={selectEntity}
              onPlanRoute={onPlanRoute}
            />

            <section className="routes-advanced-shell">
              <button type="button" className="routes-advanced-toggle" aria-expanded={advancedOpen} onClick={() => {
                const next = !advancedOpen;
                setAdvancedOpen(next);
                replaceUiState({ advanced: next });
              }}>
                <span>{advancedOpen ? copy.closeAdvanced : copy.advanced}</span><small>{copy.advancedBody}</small>
              </button>
              {advancedOpen && <section className="routes-browser-shell">
                <Suspense fallback={<div className="routes-loading" role="status">{copy.loading}</div>}>
                  <LazyRouteCatalogBrowser
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
                </Suspense>
              </section>}
            </section>
          </>
        )}
      </main>
      <footer className="site-footer"><strong>gcmp</strong><span>{copy.footer}</span></footer>
    </div>
  );
}
