import { useEffect, useMemo, useRef, useState } from 'react';
import { buildAirportIndex } from '../lib/airport-index.ts';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { LoadedData } from '../state/use-loaded-data.ts';
import { RouteCatalogBrowser } from './RouteCatalogBrowser.tsx';
import { RouteNetworkOverview } from './RouteNetworkOverview.tsx';
import { SiteHeader, type SiteView } from './SiteHeader.tsx';
import { useLocale } from '../i18n/use-locale.ts';

type AllianceFilter = 'all' | 'star' | 'oneworld' | 'skyteam';

interface Props {
  readonly data: LoadedData;
  readonly onNavigate: (view: SiteView) => void;
}

export function AllRoutesPage({ data, onNavigate }: Props): React.ReactElement {
  const { locale } = useLocale();
  const copy = locale === 'zh-TW' ? {
    eyebrow: 'GCMP 航線資料庫', title: '把世界航線看成一張網。',
    intro: '先從聯盟、樞紐與航網密度看懂全球連線，再往下查到每一條方向航線、航空公司、班號與來源證據。',
    published: '目前顯示的 published routes', all: '全部聯盟', loading: '正在載入完整航線資料庫…', error: '航線資料載入失敗',
    exploreEyebrow: 'DEEP EXPLORER', exploreTitle: '再往下，查到一條航線。', exploreBody: '保留完整 evidence drill-down，但把它放在航網總覽之後。你可以依出發／抵達、航空公司、全球區域與大型國家內部區域逐層縮小。',
    footer: '航線證據會隨時間變動。開票前請再次確認日期與實際營運航空公司。',
  } : {
    eyebrow: 'GCMP Route Library', title: 'See the world as a network.',
    intro: 'Start with alliance structure, hubs and network density, then drill all the way down to directional routes, carriers, flight numbers and evidence.',
    published: 'published routes shown', all: 'All alliances', loading: 'Loading the complete route library…', error: 'Route library failed to load',
    exploreEyebrow: 'DEEP EXPLORER', exploreTitle: 'Then inspect a route.', exploreBody: 'The full evidence drill-down remains available after the overview, with origin/destination, airline, global region and large-country local filters.',
    footer: 'Route evidence changes over time. Always recheck date and operating carrier before ticketing.',
  };
  const [network, setNetwork] = useState<RouteNetworkCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alliance, setAlliance] = useState<AllianceFilter>('all');
  const [carrierPreset, setCarrierPreset] = useState<{ carrier: string; version: number } | null>(null);
  const explorerRef = useRef<HTMLElement>(null);
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

  const memberships = data.allianceCatalog.memberships.filter((membership) => membership.status === 'member');
  const memberCodes = useMemo(() => new Set(
    memberships
      .filter((membership) => alliance === 'all' || membership.alliance === alliance)
      .map((membership) => membership.airline),
  ), [memberships, alliance]);
  const carrierNames = useMemo(() => new Map(memberships.map((membership) => [membership.airline, membership.airlineName] as const)), [memberships]);
  const published = network?.routes.filter((route) => route.status === 'published' && memberCodes.has(route.carrier)).length ?? 0;

  const focusCarrier = (carrier: string): void => {
    setCarrierPreset((current) => ({ carrier, version: (current?.version ?? 0) + 1 }));
    window.requestAnimationFrame(() => explorerRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
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
            <button key={value} type="button" className={alliance === value ? 'active' : ''} onClick={() => setAlliance(value)}>
              {value === 'all' ? copy.all : value === 'star' ? 'Star Alliance' : value === 'oneworld' ? 'oneworld' : 'SkyTeam'}
            </button>
          ))}
        </div>

        {!network && !error && <div className="routes-loading routes-loading-hero" role="status">{copy.loading}</div>}
        {error && <div className="routes-error" role="alert">{copy.error}: {error}</div>}
        {network && (
          <>
            <RouteNetworkOverview
              alliance={alliance}
              network={network}
              memberCodes={memberCodes}
              airports={airports}
              carrierNames={carrierNames}
              countryContinents={data.countryContinents}
              airportContinentOverrides={data.airportContinentOverrides}
              onCarrierSelect={focusCarrier}
            />

            <section className="routes-explorer-intro" ref={explorerRef}>
              <span>{copy.exploreEyebrow}</span>
              <div><h2>{copy.exploreTitle}</h2><p>{copy.exploreBody}</p></div>
            </section>

            <section className="routes-browser-shell">
            <RouteCatalogBrowser
              key={`${alliance}-${carrierPreset?.version ?? 0}`}
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
              initialCarrier={carrierPreset?.carrier}
            />
            </section>
          </>
        )}
      </main>
      <footer className="site-footer"><strong>gcmp</strong><span>{copy.footer}</span></footer>
    </div>
  );
}
