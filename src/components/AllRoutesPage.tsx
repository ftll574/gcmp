import { useEffect, useMemo, useState } from 'react';
import { buildAirportIndex } from '../lib/airport-index.ts';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { LoadedData } from '../state/use-loaded-data.ts';
import { RouteCatalogBrowser } from './RouteCatalogBrowser.tsx';
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
    eyebrow: 'GCMP 航線資料庫', title: '我們目前知道的世界航線。',
    intro: '把規劃器裡的航網資料獨立成可以閱讀、搜尋與驗證的資料庫。這裡呈現目前 GCMP 收錄的三大聯盟直飛方向航線、班號與來源證據。',
    published: '目前顯示的 published routes', all: '全部聯盟', loading: '正在載入完整航線資料庫…', error: '航線資料載入失敗',
    footer: '航線證據會隨時間變動。開票前請再次確認日期與實際營運航空公司。',
  } : {
    eyebrow: 'GCMP Route Library', title: 'The world routes we know today.',
    intro: 'A separate, readable and searchable view of the network behind the planner, including current alliance routes, flight numbers and evidence.',
    published: 'published routes shown', all: 'All alliances', loading: 'Loading the complete route library…', error: 'Route library failed to load',
    footer: 'Route evidence changes over time. Always recheck date and operating carrier before ticketing.',
  };
  const [network, setNetwork] = useState<RouteNetworkCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alliance, setAlliance] = useState<AllianceFilter>('all');
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

        <section className="routes-browser-shell">
          {!network && !error && <div className="routes-loading" role="status">{copy.loading}</div>}
          {error && <div className="routes-error" role="alert">{copy.error}: {error}</div>}
          {network && (
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
          )}
        </section>
      </main>
      <footer className="site-footer"><strong>gcmp</strong><span>{copy.footer}</span></footer>
    </div>
  );
}
